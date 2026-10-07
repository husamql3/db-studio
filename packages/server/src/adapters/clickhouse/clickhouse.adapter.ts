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
	DataTypes,
	DeleteColumnParamsSchemaType,
	DeleteRecordParams,
	DeleteRecordResult,
	DeleteTableParams,
	DeleteTableResult,
	ExecuteQueryResult,
	RenameColumnParamsSchemaType,
	RenameTableParamsSchemaType,
	TableDataResultSchemaType,
	TableInfoSchemaType,
	UpdateRecordsSchemaType,
} from "@db-studio/shared/types";
import {
	mapClickhouseToDataType,
	standardizeClickhouseDataTypeLabel,
	unwrapClickhouseType,
} from "@db-studio/shared/types";
import { HTTPException } from "hono/http-exception";
import type { GetTableDataParams } from "@/adapters/adapter.interface.js";
import { BaseAdapter, type NormalizedRow, type QueryBundle } from "@/adapters/base.adapter.js";
import { getClickhouseClient } from "@/adapters/connections.js";
import { parseDatabaseUrl } from "@/utils/parse-database-url.js";
import {
	buildClickhouseColumnDefinition,
	buildOrderByClause,
	buildWhereClause,
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

const NO_KEY_MESSAGE = "Rows in this table have no key to address them by";

const isNullableType = (type: string) => /^(LowCardinality\()?Nullable\(/.test(type);

/** Shapes a client value for a JSONEachRow insert into a column of `type`. */
const toClickhouseValue = (value: unknown, type: string): unknown => {
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

/** Text form of a value bound as a `String` query parameter and cast by ClickHouse. */
const toParamText = (value: unknown): string | null => {
	if (value === undefined || value === null) return null;
	if (value instanceof Date) return value.toISOString();
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
};

export class ClickhouseAdapter extends BaseAdapter {
	private serverVersion: number[] | null = null;

	// =========================================================
	// Abstract method implementations
	// =========================================================

	protected async runQuery<T>(db: string, sql: string, values: unknown[]): Promise<T> {
		const params = Object.fromEntries(values.map((value, i) => [`p${i}`, value]));
		return (await this.select(db, sql, params)) as T;
	}

	protected quoteIdentifier(name: string): string {
		return q(name);
	}

	mapToUniversalType(nativeType: string): DataTypes {
		return mapClickhouseToDataType(nativeType);
	}

	mapFromUniversalType(universalType: string): string {
		const map: Record<string, string> = {
			text: "String",
			number: "Int64",
			boolean: "Bool",
			json: "String",
			date: "DateTime",
			array: "Array(String)",
			enum: "String",
		};
		return map[universalType] ?? "String";
	}

	protected buildTableDataQuery(params: GetTableDataParams): QueryBundle {
		return this.buildPageQuery(params, []);
	}

	protected normalizeRows(rawRows: unknown[]): NormalizedRow[] {
		return (rawRows as Record<string, unknown>[]).map((row) => this.normalizeRow(row));
	}

	protected buildCursors(
		params: GetTableDataParams,
		_rows: NormalizedRow[],
		hasMore: boolean,
	): { nextCursor: string | null; prevCursor: string | null } {
		const { cursor, limit = 50 } = params;
		const offset = cursor ? this.decodeOffsetCursor(cursor) : 0;
		return {
			nextCursor: hasMore ? this.makeCursor(offset + limit) : null,
			prevCursor: offset > 0 ? this.makeCursor(Math.max(0, offset - limit)) : null,
		};
	}

	// =========================================================
	// Offset pagination: the sorting key is not unique, so keyset paging could skip rows
	// =========================================================

	override async getTableData(params: GetTableDataParams): Promise<TableDataResultSchemaType> {
		try {
			const { db, tableName, limit = 50, cursor } = params;
			const table = await this.getTable(db, tableName);
			const tieBreakers = table.sorting_key ? [`(${table.sorting_key})`] : [];
			if (table.engine.endsWith("MergeTree")) tieBreakers.push("_part", "_part_offset");

			const bundle = this.buildPageQuery(params, tieBreakers);
			const [countRows, rawRows] = await Promise.all([
				this.runQuery<{ total: string | number }[]>(db, bundle.countSql, bundle.countValues),
				this.runQuery<Record<string, unknown>[]>(db, bundle.sql, bundle.values),
			]);

			const hasMore = rawRows.length > limit;
			const rows = this.normalizeRows(hasMore ? rawRows.slice(0, limit) : rawRows);
			const offset = cursor ? this.decodeOffsetCursor(cursor) : 0;

			return {
				data: rows,
				meta: {
					limit,
					total: Number(countRows[0]?.total ?? 0),
					hasNextPage: hasMore,
					hasPreviousPage: offset > 0,
					...this.buildCursors(params, rows, hasMore),
				},
			};
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	// =========================================================
	// Databases
	// =========================================================

	async getDatabasesList(): Promise<DatabaseInfoSchemaType[]> {
		try {
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
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	async getCurrentDatabase(): Promise<DatabaseSchemaType> {
		try {
			const [row] = await this.select<{ db: string }>(
				undefined,
				"SELECT currentDatabase() AS db",
			);
			return { db: row?.db ?? "default" };
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	async getDatabaseConnectionInfo(): Promise<ConnectionInfoSchemaType> {
		try {
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
			const { host, port } = parseDatabaseUrl();
			return {
				host,
				port,
				user: info.user,
				database: info.database,
				version: `ClickHouse ${info.version}`,
				active_connections: Number(info.active_connections),
				max_connections: Number(info.max_connections),
			};
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	// =========================================================
	// Tables
	// =========================================================

	async getTablesList(db: DatabaseSchemaType["db"]): Promise<TableInfoSchemaType[]> {
		try {
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
		} catch (e) {
			throw this.wrapError(e);
		}
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

		try {
			const supportsJson = await this.isAtLeast(db, 25, 3);
			if (fields.some((f) => f.isIdentity || /serial/i.test(f.columnType))) {
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
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	async deleteTable({ tableName, db }: DeleteTableParams): Promise<DeleteTableResult> {
		try {
			await this.getTable(db, tableName);
			const [row] = await this.select<{ total: string | number }>(
				db,
				`SELECT count() AS total FROM ${q(tableName)}`,
			);
			await this.command(db, `DROP TABLE ${q(tableName)}`);
			return { deletedCount: Number(row?.total ?? 0), fkViolation: false, relatedRecords: [] };
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	async renameTable({
		tableName,
		newTableName,
		db,
	}: RenameTableParamsSchemaType): Promise<void> {
		this.assertDifferentTableName(tableName, newTableName);
		try {
			await this.getTable(db, tableName);
			if (await this.findTable(db, newTableName)) {
				throw new HTTPException(409, { message: `Table "${newTableName}" already exists` });
			}
			await this.command(db, `RENAME TABLE ${q(tableName)} TO ${q(newTableName)}`);
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	async getTableSchema({
		tableName,
		db,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<string> {
		try {
			await this.getTable(db, tableName);
			const [row] = await this.select<{ statement: string }>(
				db,
				`SHOW CREATE TABLE ${q(tableName)}`,
			);
			return row?.statement ?? "";
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	// =========================================================
	// Columns
	// =========================================================

	async getTableColumns({
		tableName,
		db,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<ColumnInfoSchemaType[]> {
		try {
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
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	async addColumn(params: AddColumnParamsSchemaType): Promise<void> {
		const { tableName, columnName, db } = params;
		if (params.isUnique) {
			throw new HTTPException(400, {
				message: "ClickHouse does not enforce UNIQUE constraints",
			});
		}
		try {
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
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	async deleteColumn({
		tableName,
		columnName,
		db,
	}: DeleteColumnParamsSchemaType): Promise<{ deletedCount: number }> {
		try {
			const column = await this.getColumn(db, tableName, columnName);
			if (column.is_in_sorting_key) {
				throw new HTTPException(400, {
					message: `"${columnName}" is part of the sorting key and cannot be dropped`,
				});
			}
			await this.command(db, `ALTER TABLE ${q(tableName)} DROP COLUMN ${q(columnName)}`);
			return { deletedCount: 1 };
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	async alterColumn(params: AlterColumnParamsSchemaType): Promise<void> {
		const { tableName, columnName, db } = params;
		try {
			const column = await this.getColumn(db, tableName, columnName);
			const def = buildClickhouseColumnDefinition(
				{ ...params, columnName, isPrimaryKey: column.is_in_sorting_key === 1 },
				await this.isAtLeast(db, 25, 3),
			);
			await this.command(db, `ALTER TABLE ${q(tableName)} MODIFY COLUMN ${def}`);
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	async renameColumn({
		tableName,
		columnName,
		newColumnName,
		db,
	}: RenameColumnParamsSchemaType): Promise<void> {
		try {
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
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	// =========================================================
	// Records
	// =========================================================

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

	/**
	 * Applies every row's changes in one `ALTER TABLE ... UPDATE` mutation and waits
	 * for it. Each addressed key must match exactly one row: the sorting key is not
	 * unique, and a mutation cannot target one of several identical-key rows.
	 */
	async updateRecords({
		db,
		params,
	}: {
		db: DatabaseSchemaType["db"];
		params: UpdateRecordsSchemaType;
	}): Promise<{ updatedCount: number }> {
		const { tableName } = params;
		try {
			const keyColumns = this.resolveKeyColumns(params);
			const groups = this.groupUpdatesByKey(params, keyColumns);
			const columns = await this.getKeyedColumns(db, tableName, keyColumns);
			const keyNames = new Set(columns.filter((c) => c.is_in_sorting_key).map((c) => c.name));

			const types = new Map(columns.map((c) => [c.name, c.type]));
			const queryParams: Params = {};
			const bind = (value: unknown, type = "String") => {
				const name = `p${Object.keys(queryParams).length}`;
				// Array and Map literals need ClickHouse quoting, so they bind with their own type.
				const structured = /^(Array|Map)\(/.test(type);
				queryParams[name] = structured ? toClickhouseValue(value, type) : toParamText(value);
				return `{${name}:${structured ? type : "Nullable(String)"}}`;
			};

			const commands: string[] = [];
			for (const { keyValues, rowUpdates } of groups) {
				for (const { columnName } of rowUpdates) {
					if (keyNames.has(columnName)) {
						throw new HTTPException(400, {
							message: `"${columnName}" is part of the sorting key; ClickHouse cannot update key columns`,
						});
					}
				}
				const where = keyColumns
					.map((col, i) => `${q(col)} = ${bind(keyValues[i])}`)
					.join(" AND ");
				await this.assertMatches(db, tableName, where, queryParams, 1, () =>
					this.describeKey(keyColumns, keyValues),
				);
				const sets = rowUpdates
					.map((u) => `${q(u.columnName)} = ${bind(u.value, types.get(u.columnName))}`)
					.join(", ");
				commands.push(`UPDATE ${sets} WHERE ${where}`);
			}

			await this.command(
				db,
				`ALTER TABLE ${q(tableName)} ${commands.join(", ")}`,
				queryParams,
				MUTATION_SETTINGS,
			);
			return { updatedCount: groups.length };
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	async deleteRecords({
		tableName,
		primaryKeys,
		db,
	}: DeleteRecordParams): Promise<DeleteRecordResult> {
		const keyColumn = primaryKeys[0]?.columnName;
		if (!keyColumn) {
			throw new HTTPException(400, { message: "Primary key column name is required" });
		}
		try {
			await this.getKeyedColumns(db, tableName, [keyColumn]);
			const values = [...new Set(primaryKeys.map((pk) => toParamText(pk.value)))];
			const queryParams: Params = Object.fromEntries(values.map((v, i) => [`p${i}`, v]));
			const where = `${q(keyColumn)} IN (${values.map((_, i) => `{p${i}:String}`).join(", ")})`;

			const deletedCount = await this.assertMatches(
				db,
				tableName,
				where,
				queryParams,
				values.length,
				() => `${keyColumn} IN (${values.join(", ")})`,
			);
			await this.command(
				db,
				`ALTER TABLE ${q(tableName)} DELETE WHERE ${where}`,
				queryParams,
				MUTATION_SETTINGS,
			);
			return { deletedCount, fkViolation: false, relatedRecords: [] };
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	async forceDeleteRecords(params: DeleteRecordParams): Promise<{ deletedCount: number }> {
		const { deletedCount } = await this.deleteRecords(params);
		return { deletedCount };
	}

	// =========================================================
	// Query
	// =========================================================

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
		try {
			const client = getClickhouseClient(db);
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
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	// =========================================================
	// Private helpers
	// =========================================================

	private async select<T = Record<string, unknown>>(
		db: string | undefined,
		query: string,
		queryParams: Params = {},
	): Promise<T[]> {
		const result = await getClickhouseClient(db).query({
			query,
			query_params: queryParams,
			format: "JSONEachRow",
		});
		return result.json<T>();
	}

	private async command(
		db: string,
		query: string,
		queryParams: Params = {},
		settings: Record<string, string> = {},
	): Promise<void> {
		await getClickhouseClient(db).command({
			query,
			query_params: queryParams,
			clickhouse_settings: settings,
		});
	}

	private buildPageQuery(params: GetTableDataParams, tieBreakers: string[]): QueryBundle {
		const { tableName, filters = [], sort = [], order = "asc", limit = 50, cursor } = params;
		const { clause, values } = buildWhereClause(filters);
		const orderBy = buildOrderByClause(sort, order, tieBreakers);
		const offset = cursor ? this.decodeOffsetCursor(cursor) : 0;
		const n = values.length;

		return {
			sql: `SELECT * FROM ${q(tableName)} ${clause} ${orderBy} LIMIT {p${n + 1}:UInt64} OFFSET {p${n}:UInt64}`,
			values: [...values, offset, limit + 1],
			countSql: `SELECT count() AS total FROM ${q(tableName)} ${clause}`,
			countValues: values,
		};
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

	/** Columns of a table whose rows can be addressed by `keyColumns` (all in the sorting key). */
	private async getKeyedColumns(
		db: string,
		tableName: string,
		keyColumns: string[],
	): Promise<ColumnRow[]> {
		const table = await this.getTable(db, tableName);
		if (!table.sorting_key) throw new HTTPException(400, { message: NO_KEY_MESSAGE });
		const columns = await this.getColumns(db, tableName);
		const notKey = keyColumns.find(
			(key) => !columns.some((c) => c.name === key && c.is_in_sorting_key),
		);
		if (notKey) {
			throw new HTTPException(400, {
				message: `"${notKey}" is not in the table's sorting key, so it cannot address rows`,
			});
		}
		return columns;
	}

	/** Counts rows matching `where`; throws unless exactly `expected` rows match. */
	private async assertMatches(
		db: string,
		tableName: string,
		where: string,
		queryParams: Params,
		expected: number,
		describe: () => string,
	): Promise<number> {
		const [row] = await this.select<{ total: string | number }>(
			db,
			`SELECT count() AS total FROM ${q(tableName)} WHERE ${where}`,
			queryParams,
		);
		const total = Number(row?.total ?? 0);
		if (total === 0) {
			throw new HTTPException(404, {
				message: `Record with ${describe()} not found in table "${tableName}"`,
			});
		}
		if (total > expected) {
			throw new HTTPException(400, {
				message: `${total} rows match ${describe()}; ClickHouse keys are not unique, so these rows cannot be told apart. Edit them with a query instead.`,
			});
		}
		return total;
	}

	private async insertRows(
		db: string,
		tableName: string,
		records: Record<string, unknown>[],
	): Promise<void> {
		try {
			await this.getTable(db, tableName);
			const types = new Map(
				(await this.getColumns(db, tableName)).map((c) => [c.name, c.type]),
			);
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
			await getClickhouseClient(db).insert({
				table: q(tableName),
				values,
				format: "JSONEachRow",
				clickhouse_settings: { date_time_input_format: "best_effort" },
			});
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	private async isAtLeast(db: string, major: number, minor: number): Promise<boolean> {
		if (!this.serverVersion) {
			const [row] = await this.select<{ version: string }>(db, "SELECT version() AS version");
			this.serverVersion = (row?.version ?? "0.0").split(".").map(Number);
		}
		const [actualMajor = 0, actualMinor = 0] = this.serverVersion;
		return actualMajor > major || (actualMajor === major && actualMinor >= minor);
	}

	private makeCursor(offset: number): string {
		return this.encodeCursor({ values: { _offset: offset }, sortColumns: ["_offset"] });
	}

	private decodeOffsetCursor(cursor: string): number {
		return Number(this.decodeCursor(cursor)?.values._offset ?? 0);
	}
}
