import { type ClickHouseClient, ClickHouseError } from "@clickhouse/client";
import type {
	AddColumnParamsSchemaType,
	AddRecordSchemaType,
	AlterColumnParamsSchemaType,
	BulkInsertRecordsParams,
	BulkInsertResult,
	ColumnInfoSchemaType,
	ConnectionInfoSchemaType,
	CreateTableSchemaType,
	DatabaseInfoSchemaType,
	DatabaseSchemaType,
	DeleteColumnParamsSchemaType,
	DeleteTableParams,
	DeleteTableResult,
	ExecuteQueryResult,
	RenameColumnParamsSchemaType,
	RenameTableParamsSchemaType,
	ServerLogEntrySchemaType,
	ServerLogLevel,
	ServerLogsResult,
	TableDataResultSchemaType,
	TableInfoSchemaType,
} from "@db-studio/shared/types";
import {
	isSerialType,
	mapClickhouseToDataType,
	standardizeClickhouseDataTypeLabel,
	unwrapClickhouseType,
} from "@db-studio/shared/types";
import type { GetTableDataParams } from "@/adapters/adapter.interface.js";
import { BaseAdapter, type DriverErrorClass, probeOnce } from "@/adapters/base.adapter.js";
import {
	logDetail,
	logsUnavailable,
	newestEntries,
	SERVER_LOGS_LIMIT,
	SERVER_LOGS_MARKER,
} from "@/adapters/server-logs.js";
import { buildFilterConditions, createBinds, whereSql } from "@/adapters/sql-filters.js";
import { offsetOf, offsetOrderBy, offsetPage, orderTerms } from "@/adapters/sql-pagination.js";
import type { ServerAddress } from "@/connection-url.js";
import { HTTPException } from "@/http-exception.js";
import { connector } from "@/open-connections.js";
import {
	buildClickhouseColumnDefinition,
	clickhouseFilters,
	clickhousePlaceholder,
	quoteClickhouseIdentifier as q,
} from "./clickhouse.query-builder.js";

interface ColumnRow {
	name: string;
	type: string;
	default_expression: string;
	is_in_sorting_key: number;
}

interface TableRow {
	engine: string;
	sorting_key: string;
}

type Params = Record<string, unknown>;

/** Wait for ALTER ... UPDATE/DELETE mutations to finish on every replica before returning. */
const MUTATION_SETTINGS = { mutations_sync: "2" } as const;

const isNullableType = (type: string) => /^(LowCardinality\()?Nullable\(/.test(type);

/** Shapes a client value for a JSONEachRow insert into a column of `type`. */
const toClickhouseValue = <T>(value: T, type: string): T | string | boolean | null => {
	if (value === undefined || value === null) return null;
	const base = unwrapClickhouseType(type);

	if (value === "" && base !== "String" && !base.startsWith("FixedString")) return null;

	if (value instanceof Date) return value.toISOString();

	if (base === "Bool" && typeof value === "string") {
		return ["true", "t", "1", "yes", "on"].includes(value.trim().toLowerCase());
	}

	if (
		typeof value === "string" &&
		(base.startsWith("JSON") || base.startsWith("Array(") || base.startsWith("Map("))
	) {
		try {
			return JSON.parse(value);
		} catch {
			throw new HTTPException(400, { message: `Invalid ${base} value: ${value}` });
		}
	}

	if (typeof value === "object" && base === "String") return JSON.stringify(value);

	return value;
};

interface QueryLogRow {
	ms: string;
	type: string;
	query_duration_ms: string;
	query: string;
	exception: string;
	exception_code: number;
	user: string;
	query_id: string;
	read_rows: string;
	memory: string;
}

interface TextLogRow {
	ms: string;
	level: string;
	logger_name: string;
	message: string;
	query_id: string;
}

const TEXT_LOG_LEVELS: Record<string, ServerLogLevel> = {
	Fatal: "fatal",
	Critical: "fatal",
	Error: "error",
	Warning: "warning",
};

export class ClickhouseAdapter extends BaseAdapter {
	private serverVersion = probeOnce(async (client: ClickHouseClient) => {
		const result = await client.query({
			query: "SELECT version() AS version",
			format: "JSONEachRow",
		});

		const [row] = await result.json<{ version: string }>();

		return (row?.version ?? "0.0").split(".").map(Number);
	});

	protected override classifyDriverError(e: Error): DriverErrorClass | undefined {
		// A wrong password, or @clickhouse/client's request timeout.
		if (
			e.message.includes("Authentication failed: password is incorrect") ||
			e.message === "Timeout error."
		)
			return { status: 503 };

		return undefined;
	}

	/** Offset pagination: the sorting key is not unique, so keyset paging could skip rows. */
	override async getTableData(params: GetTableDataParams): Promise<TableDataResultSchemaType> {
		const {
			db,
			tableName,
			filters = [],
			sort = [],
			order = "asc",
			limit = 50,
			cursor,
		} = params;

		const table = await this.getTable(db, tableName);
		const tieBreakers = table.sorting_key ? [`(${table.sorting_key})`] : [];

		if (table.engine.endsWith("MergeTree")) tieBreakers.push("_part", "_part_offset");

		const { values, bind } = createBinds(clickhousePlaceholder);
		const where = whereSql(buildFilterConditions(filters, bind, clickhouseFilters));

		const terms = orderTerms(
			sort,
			order,
			tieBreakers.map((raw) => ({ raw })),
		);

		const offset = offsetOf(cursor);
		const n = values.length;

		const bindAll = (bound: unknown[]) =>
			Object.fromEntries(bound.map((value, i) => [`p${i}`, value]));

		const [countRows, fetched] = await Promise.all([
			this.select<{ total: string | number }>(
				db,
				`SELECT count() AS total FROM ${q(tableName)} ${where}`,
				bindAll(values),
			),
			this.select(
				db,
				`SELECT * FROM ${q(tableName)} ${where} ${offsetOrderBy(terms, q)} LIMIT {p${n + 1}:UInt64} OFFSET {p${n}:UInt64}`,
				bindAll([...values, offset, limit + 1]),
			),
		]);

		const { rows, ...page } = offsetPage(fetched, offset, limit);

		return {
			data: rows,
			meta: { limit, total: Number(countRows[0]?.total ?? 0), ...page },
		};
	}

	async exportTableData({
		tableName,
		db,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<{ cols: string[]; rows: Record<string, unknown>[] }> {
		await this.getTable(db, tableName);
		const rows = await this.select(db, `SELECT * FROM ${q(tableName)}`);

		if (rows.length) return { cols: Object.keys(rows[0]), rows };

		// SELECT * leaves out MATERIALIZED, ALIAS and EPHEMERAL columns, so an empty export does too.
		const columns = await this.select<{ name: string }>(
			db,
			`SELECT name FROM system.columns
			WHERE database = currentDatabase() AND table = {table:String} AND default_kind NOT IN ('MATERIALIZED', 'ALIAS', 'EPHEMERAL')
			ORDER BY position`,
			{ table: tableName },
		);

		return { cols: columns.map((c) => c.name), rows };
	}

	async getDatabasesList(): Promise<DatabaseInfoSchemaType[]> {
		const rows = await this.select<{ name: string; size: string }>(
			undefined,
			`SELECT d.name AS name, formatReadableSize(p.bytes) AS size
				FROM system.databases AS d
				LEFT JOIN (
					SELECT database, sum(bytes_on_disk) AS bytes FROM system.parts WHERE active GROUP BY database
				) AS p ON p.database = d.name
				WHERE d.name NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
				ORDER BY d.name`,
		);

		return rows.map((row) => ({ ...row, owner: "", encoding: "UTF-8" }));
	}

	async getCurrentDatabase(): Promise<DatabaseSchemaType> {
		const [row] = await this.select<{ db: string }>(
			undefined,
			"SELECT currentDatabase() AS db",
		);

		return { db: row?.db ?? "default" };
	}

	async getDatabaseConnectionInfo(server: ServerAddress): Promise<ConnectionInfoSchemaType> {
		const [info] = await this.select<{
			version: string;
			user: string;
			database: string;
			active_connections: number;
			max_connections: string;
		}>(
			undefined,
			`SELECT
					version() AS version,
					currentUser() AS user,
					currentDatabase() AS database,
					(SELECT sum(value) FROM system.metrics WHERE metric IN ('TCPConnection', 'HTTPConnection', 'MySQLConnection', 'PostgreSQLConnection')) AS active_connections,
					(SELECT value FROM system.server_settings WHERE name = 'max_connections') AS max_connections`,
		);

		if (!info) {
			throw new HTTPException(500, { message: "No connection information returned" });
		}

		return {
			...server,
			user: info.user,
			database: info.database,
			version: `ClickHouse ${info.version}`,
			active_connections: Number(info.active_connections),
			max_connections: Number(info.max_connections),
		};
	}

	async getTablesList(db: DatabaseSchemaType["db"]): Promise<TableInfoSchemaType[]> {
		const rows = await this.select<{ tableName: string; rowCount: string | number | null }>(
			db,
			`SELECT name AS tableName, total_rows AS rowCount
				FROM system.tables
				WHERE database = currentDatabase() AND NOT is_temporary AND NOT startsWith(name, '.inner')
				ORDER BY name`,
		);

		return rows.map((row) => ({
			tableName: row.tableName,
			rowCount: Number(row.rowCount ?? 0),
		}));
	}

	async createTable({
		tableData,
		db,
	}: {
		tableData: CreateTableSchemaType;
		db: DatabaseSchemaType["db"];
	}): Promise<void> {
		const { tableName, fields, foreignKeys } = tableData;

		if (foreignKeys?.length) {
			throw new HTTPException(400, { message: "ClickHouse does not support foreign keys" });
		}

		const unique = fields.find((f) => f.isUnique && !f.isPrimaryKey);

		if (unique) {
			throw new HTTPException(400, {
				message: `ClickHouse does not enforce UNIQUE constraints; clear "Unique" on "${unique.columnName}"`,
			});
		}

		const supportsJson = await this.isAtLeast(db, 25, 3);

		if (fields.some((f) => f.isIdentity || isSerialType(f.columnType))) {
			if (!(await this.isAtLeast(db, 24, 6))) {
				throw new HTTPException(400, {
					message: "Auto-generated ids need ClickHouse 24.6 or newer (generateSnowflakeID)",
				});
			}
		}

		const columns = fields.map((f) => buildClickhouseColumnDefinition(f, supportsJson));
		const keys = fields.filter((f) => f.isPrimaryKey).map((f) => q(f.columnName));
		await this.command(
			db,
			`CREATE TABLE ${q(tableName)} (${columns.join(", ")}) ENGINE = MergeTree ORDER BY ${keys.length ? `(${keys.join(", ")})` : "tuple()"}`,
		);
	}

	async deleteTable({ tableName, db }: DeleteTableParams): Promise<DeleteTableResult> {
		await this.getTable(db, tableName);

		const [row] = await this.select<{ total: string | number }>(
			db,
			`SELECT count() AS total FROM ${q(tableName)}`,
		);

		await this.command(db, `DROP TABLE ${q(tableName)}`);

		return { deletedCount: Number(row?.total ?? 0), fkViolation: false, relatedRecords: [] };
	}

	async renameTable({
		tableName,
		newTableName,
		db,
	}: RenameTableParamsSchemaType): Promise<void> {
		this.assertDifferentTableName(tableName, newTableName);

		await this.getTable(db, tableName);

		if (await this.findTable(db, newTableName)) {
			throw new HTTPException(409, { message: `Table "${newTableName}" already exists` });
		}

		await this.command(db, `RENAME TABLE ${q(tableName)} TO ${q(newTableName)}`);
	}

	async getTableSchema({
		tableName,
		db,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<string> {
		await this.getTable(db, tableName);

		const [row] = await this.select<{ statement: string }>(
			db,
			`SHOW CREATE TABLE ${q(tableName)}`,
		);

		return row?.statement ?? "";
	}

	async getTableColumns({
		tableName,
		db,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<ColumnInfoSchemaType[]> {
		await this.getTable(db, tableName);
		const columns = await this.getColumns(db, tableName);

		return columns.map((col) => ({
			columnName: col.name,
			dataType: mapClickhouseToDataType(col.type),
			dataTypeLabel: standardizeClickhouseDataTypeLabel(col.type),
			isNullable: isNullableType(col.type),
			columnDefault: col.default_expression || null,
			isPrimaryKey: col.is_in_sorting_key === 1,
			isForeignKey: false,
			referencedTable: null,
			referencedColumn: null,
			enumValues: /^Enum(8|16)\(/.test(unwrapClickhouseType(col.type))
				? [...col.type.matchAll(/'((?:[^'\\]|\\.)*)'\s*=/g)].map((m) => m[1] ?? "")
				: null,
		}));
	}

	async addColumn(params: AddColumnParamsSchemaType): Promise<void> {
		const { tableName, columnName, db } = params;

		if (params.isUnique) {
			throw new HTTPException(400, {
				message: "ClickHouse does not enforce UNIQUE constraints",
			});
		}

		await this.getTable(db, tableName);
		const columns = await this.getColumns(db, tableName);

		if (columns.some((c) => c.name === columnName)) {
			throw new HTTPException(409, {
				message: `Column "${columnName}" already exists in table "${tableName}"`,
			});
		}

		const def = buildClickhouseColumnDefinition(
			{ ...params, isPrimaryKey: false },
			await this.isAtLeast(db, 25, 3),
		);

		await this.command(db, `ALTER TABLE ${q(tableName)} ADD COLUMN ${def}`);
	}

	async deleteColumn({
		tableName,
		columnName,
		db,
	}: DeleteColumnParamsSchemaType): Promise<{ deletedCount: number }> {
		const column = await this.getColumn(db, tableName, columnName);

		if (column.is_in_sorting_key) {
			throw new HTTPException(400, {
				message: `"${columnName}" is part of the sorting key and cannot be dropped`,
			});
		}

		await this.command(db, `ALTER TABLE ${q(tableName)} DROP COLUMN ${q(columnName)}`);

		return { deletedCount: 1 };
	}

	async alterColumn(params: AlterColumnParamsSchemaType): Promise<void> {
		const { tableName, columnName, db } = params;

		const column = await this.getColumn(db, tableName, columnName);

		const def = buildClickhouseColumnDefinition(
			{ ...params, columnName, isPrimaryKey: column.is_in_sorting_key === 1 },
			await this.isAtLeast(db, 25, 3),
		);

		await this.command(db, `ALTER TABLE ${q(tableName)} MODIFY COLUMN ${def}`);
	}

	async renameColumn({
		tableName,
		columnName,
		newColumnName,
		db,
	}: RenameColumnParamsSchemaType): Promise<void> {
		await this.getColumn(db, tableName, columnName);
		const columns = await this.getColumns(db, tableName);

		if (columns.some((c) => c.name === newColumnName)) {
			throw new HTTPException(409, {
				message: `Column "${newColumnName}" already exists in table "${tableName}"`,
			});
		}

		await this.command(
			db,
			`ALTER TABLE ${q(tableName)} RENAME COLUMN ${q(columnName)} TO ${q(newColumnName)}`,
		);
	}

	async addRecord({
		db,
		params,
	}: {
		db: DatabaseSchemaType["db"];
		params: AddRecordSchemaType;
	}): Promise<{ insertedCount: number }> {
		if (!Object.keys(params.data).length) {
			throw new HTTPException(400, { message: "No data provided for insert" });
		}

		await this.insertRows(db, params.tableName, [params.data]);

		return { insertedCount: 1 };
	}

	async bulkInsertRecords({
		tableName,
		records,
		db,
	}: BulkInsertRecordsParams): Promise<BulkInsertResult> {
		if (!records?.length) {
			throw new HTTPException(400, { message: "At least one record is required" });
		}

		await this.insertRows(db, tableName, records);

		return {
			success: true,
			message: `Bulk insert completed: ${records.length} records inserted`,
			successCount: records.length,
			failureCount: 0,
		};
	}

	async executeQuery({
		query,
		db,
	}: {
		query: string;
		db: DatabaseSchemaType["db"];
	}): Promise<ExecuteQueryResult> {
		const cleaned = query.trim().replace(/;+\s*$/, "");

		if (!cleaned) throw new HTTPException(400, { message: "Query is required" });

		const start = performance.now();

		const client = await connector("clickhouse").client(db);

		const firstKeyword = cleaned
			.replace(/^(\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/))*/, "")
			.match(/^\s*(\w+)/)?.[1]
			?.toUpperCase();

		if (
			firstKeyword &&
			["SELECT", "WITH", "SHOW", "DESC", "DESCRIBE", "EXPLAIN", "EXISTS"].includes(
				firstKeyword,
			)
		) {
			const result = await client.query({ query: cleaned, format: "JSON" });
			const { meta = [], data } = await result.json<Record<string, unknown>>();

			return {
				columns: meta.map((m) => m.name),
				rows: data,
				rowCount: data.length,
				duration: performance.now() - start,
				message: data.length === 0 ? "OK" : undefined,
			};
		}

		const { summary } = await client.command({
			query: cleaned,
			clickhouse_settings: MUTATION_SETTINGS,
		});

		const rowCount = Number(summary?.written_rows ?? 0);

		return {
			columns: [],
			rows: [],
			rowCount,
			duration: performance.now() - start,
			message: `OK (${rowCount} rows affected)`,
		};
	}

	/**
	 * Queries come from system.query_log, which is on by default, and the server's own warnings
	 * and errors from system.text_log when the server config enables it. text_log lines from
	 * the query handlers are left out: they repeat the query_log exceptions.
	 */
	async getServerLogs({ db }: { db: DatabaseSchemaType["db"] }): Promise<ServerLogsResult> {
		const client = await connector("clickhouse").client(db);

		// log_queries = 0 keeps these reads out of the query_log they read.
		const read = async <T>(query: string): Promise<T[] | null> => {
			try {
				const result = await client.query({
					query: `${SERVER_LOGS_MARKER} ${query}`,
					format: "JSONEachRow",
					clickhouse_settings: { log_queries: 0 },
				});

				return await result.json<T>();
			} catch (e) {
				if (e instanceof ClickHouseError && e.type === "UNKNOWN_TABLE") return null;
				throw e;
			}
		};

		try {
			const queries = await read<QueryLogRow>(
				`SELECT toUnixTimestamp64Milli(event_time_microseconds) AS ms, type, query_duration_ms,
					query, exception, exception_code, user, query_id, read_rows,
					formatReadableSize(memory_usage) AS memory
				FROM system.query_log
				WHERE event_date >= yesterday() AND type != 'QueryStart' AND is_initial_query
				ORDER BY event_time_microseconds DESC LIMIT ${SERVER_LOGS_LIMIT}`,
			);

			const events = await read<TextLogRow>(
				`SELECT toUnixTimestamp64Milli(event_time_microseconds) AS ms, level, logger_name,
					message, query_id
				FROM system.text_log
				WHERE event_date >= yesterday()
					AND level IN ('Fatal', 'Critical', 'Error', 'Warning')
					AND logger_name NOT IN ('executeQuery', 'TCPHandler', 'HTTPHandler')
				ORDER BY event_time_microseconds DESC LIMIT ${SERVER_LOGS_LIMIT}`,
			);

			if (!queries && !events) {
				return logsUnavailable("query_log and text_log are both off in the server config.");
			}

			const entries: ServerLogEntrySchemaType[] = [
				...(queries ?? []).reverse().map((row): ServerLogEntrySchemaType => {
					const failed = row.type !== "QueryFinish";

					return {
						ts: new Date(Number(row.ms)).toISOString(),
						level: failed ? "error" : "info",
						rawLevel: row.type,
						code: failed ? String(row.exception_code) : undefined,
						message: failed ? row.exception : row.query,
						durationMs: Number(row.query_duration_ms),
						statement: failed ? row.query : undefined,
						detail: logDetail({
							user: row.user,
							query_id: row.query_id,
							read_rows: row.read_rows,
							memory: row.memory,
						}),
					};
				}),
				...(events ?? []).reverse().map((row): ServerLogEntrySchemaType => ({
					ts: new Date(Number(row.ms)).toISOString(),
					level: TEXT_LOG_LEVELS[row.level] ?? "info",
					rawLevel: row.level,
					source: row.logger_name,
					message: row.message,
					detail: logDetail({ query_id: row.query_id }),
				})),
			];

			return {
				available: true,
				source: events ? "system.query_log + system.text_log" : "system.query_log",
				entries: newestEntries(entries),
			};
		} catch (e) {
			if (e instanceof ClickHouseError && e.type === "ACCESS_DENIED") {
				return logsUnavailable(
					"Reading the server log needs: GRANT SELECT ON system.query_log TO <user>; and the same on system.text_log.",
				);
			}

			throw e;
		}
	}

	private async select<T = Record<string, unknown>>(
		db: string | undefined,
		query: string,
		queryParams: Params = {},
	): Promise<T[]> {
		const result = await (
			await connector("clickhouse").client(db)
		).query({
			query,
			query_params: queryParams,
			format: "JSONEachRow",
		});

		return result.json<T>();
	}

	private async command(db: string, query: string): Promise<void> {
		await (await connector("clickhouse").client(db)).command({ query });
	}

	private async findTable(db: string, tableName: string): Promise<TableRow | undefined> {
		const [row] = await this.select<TableRow>(
			db,
			"SELECT engine, sorting_key FROM system.tables WHERE database = currentDatabase() AND name = {table:String}",
			{ table: tableName },
		);

		return row;
	}

	private async getTable(db: string, tableName: string): Promise<TableRow> {
		const table = await this.findTable(db, tableName);

		if (!table)
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });

		return table;
	}

	private getColumns(db: string, tableName: string): Promise<ColumnRow[]> {
		return this.select<ColumnRow>(
			db,
			`SELECT name, type, default_expression, is_in_sorting_key
			FROM system.columns
			WHERE database = currentDatabase() AND table = {table:String}
			ORDER BY position`,
			{ table: tableName },
		);
	}

	private async getColumn(db: string, tableName: string, columnName: string) {
		await this.getTable(db, tableName);
		const column = (await this.getColumns(db, tableName)).find((c) => c.name === columnName);

		if (!column) {
			throw new HTTPException(404, {
				message: `Column "${columnName}" does not exist in table "${tableName}"`,
			});
		}

		return column;
	}

	private async insertRows(
		db: string,
		tableName: string,
		records: Record<string, unknown>[],
	): Promise<void> {
		await this.getTable(db, tableName);

		const types = new Map((await this.getColumns(db, tableName)).map((c) => [c.name, c.type]));

		const values = records.map((record) =>
			Object.fromEntries(
				Object.entries(record).flatMap(([column, value]) => {
					const type = types.get(column);

					if (!type) {
						throw new HTTPException(400, {
							message: `Column "${column}" does not exist in table "${tableName}"`,
						});
					}

					const shaped = toClickhouseValue(value, type);

					// Omit nulls for non-nullable columns so ClickHouse applies the column default.
					return shaped === null && !isNullableType(type) ? [] : [[column, shaped]];
				}),
			),
		);

		await (
			await connector("clickhouse").client(db)
		).insert({
			table: q(tableName),
			values,
			format: "JSONEachRow",
			clickhouse_settings: { date_time_input_format: "best_effort" },
		});
	}

	private async isAtLeast(db: string, major: number, minor: number): Promise<boolean> {
		const [actualMajor = 0, actualMinor = 0] = await this.serverVersion(
			await connector("clickhouse").client(db),
		);

		return actualMajor > major || (actualMajor === major && actualMinor >= minor);
	}
}
