import { statSync } from "node:fs";
import type {
	AddColumnParamsSchemaType,
	AddRecordSchemaType,
	AlterColumnParamsSchemaType,
	BulkInsertRecordsParams,
	BulkInsertResult,
	ColumnInfoSchemaType,
	ConnectionInfoSchemaType,
	CreateTableSchemaType,
	CursorData,
	DatabaseInfoSchemaType,
	DatabaseSchemaType,
	DataTypes,
	DeleteColumnParamsSchemaType,
	DeleteRecordParams,
	DeleteRecordResult,
	DeleteTableParams,
	DeleteTableResult,
	ExecuteQueryResult,
	FieldDataType,
	ForeignKeyConstraint,
	ForeignKeyDataType,
	RelatedRecord,
	RenameColumnParamsSchemaType,
	RenameTableParamsSchemaType,
	SortDirection,
	TableInfoSchemaType,
	UpdateRecordsSchemaType,
} from "@db-studio/shared/types";
import { mapSqliteToDataType, standardizeSqliteDataTypeLabel } from "@db-studio/shared/types";
import type { InStatement, InValue, ResultSet, Value } from "@libsql/client";
import { HTTPException } from "hono/http-exception";
import type { GetTableDataParams } from "@/adapters/adapter.interface.js";
import { BaseAdapter, type NormalizedRow, type QueryBundle } from "@/adapters/base.adapter.js";
import { getSqliteClient } from "@/adapters/connections.js";
import {
	buildCursorWhereClause,
	buildSortClause,
	buildWhereClause,
} from "./sqlite.query-builder.js";

interface TableInfoRow {
	cid: number;
	name: string;
	type: string;
	notnull: number;
	dflt_value: string | null;
	pk: number;
}

interface FkRow {
	id: number;
	seq: number;
	table: string;
	from: string;
	/** null when the constraint references the parent's primary key implicitly */
	to: string | null;
	on_update: string;
	on_delete: string;
}

/** A (possibly composite) foreign key, seen from the table it references. */
interface ForeignKeyEdge {
	childTable: string;
	childColumns: string[];
	parentColumns: (string | null)[];
}

const allNamed = (columns: (string | null)[]): columns is string[] =>
	columns.every((c) => c !== null);

/** A client or an open transaction. */
interface SqlExecutor {
	execute(stmt: InStatement): Promise<ResultSet>;
}

const toSqliteValue = (value: unknown): InValue => {
	if (value === null || value === undefined) return null;
	if (typeof value === "boolean") return value ? 1 : 0;
	if (typeof value === "string" || typeof value === "number" || typeof value === "bigint")
		return value;
	if (value instanceof Date) return value.toISOString();
	return JSON.stringify(value);
};

const stmt = (sql: string, values: unknown[] = []): InStatement => ({
	sql,
	args: values.map(toSqliteValue),
});

const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

// The client runs in intMode "bigint" so integers past 2^53 don't throw; JSON can't carry
// bigint or ArrayBuffer, and the export writer renders Buffers as hex.
const fromSqliteValue = (value: Value): unknown => {
	if (typeof value === "bigint")
		return value >= MIN_SAFE && value <= MAX_SAFE ? Number(value) : value.toString();
	if (value instanceof ArrayBuffer) return Buffer.from(value);
	return value;
};

const toRows = <T = Record<string, unknown>>({ columns, rows }: ResultSet): T[] =>
	rows.map(
		(row) => Object.fromEntries(columns.map((col, i) => [col, fromSqliteValue(row[i])])) as T,
	);

const all = async <T = Record<string, unknown>>(
	executor: SqlExecutor,
	sql: string,
	values: unknown[] = [],
): Promise<T[]> => toRows<T>(await executor.execute(stmt(sql, values)));

const isFkViolation = (e: unknown) =>
	e instanceof Error && e.message.includes("FOREIGN KEY constraint failed");

export class SqliteAdapter extends BaseAdapter {
	// alterColumn reads the column list and then rebuilds the table from it; a column added
	// between the two would be dropped by the rebuild, so column changes run one at a time.
	private schemaChange: Promise<unknown> = Promise.resolve();

	private serializeSchemaChange<T>(change: () => Promise<T>): Promise<T> {
		const run = this.schemaChange.then(change);
		this.schemaChange = run.catch(() => {});
		return run;
	}

	// =========================================================
	// Abstract method implementations
	// =========================================================

	protected async runQuery<T>(_db: string, sql: string, values: unknown[]): Promise<T> {
		return (await all(await getSqliteClient(), sql, values)) as T;
	}

	protected quoteIdentifier(name: string): string {
		return `"${name.replaceAll('"', '""')}"`;
	}

	mapToUniversalType(nativeType: string): DataTypes {
		return mapSqliteToDataType(nativeType);
	}

	mapFromUniversalType(universalType: string): string {
		const map: Record<string, string> = {
			text: "TEXT",
			number: "INTEGER",
			boolean: "INTEGER",
			json: "TEXT",
			date: "TEXT",
			array: "TEXT",
			enum: "TEXT",
		};
		return map[universalType] ?? "TEXT";
	}

	protected buildTableDataQuery(params: GetTableDataParams): QueryBundle {
		const {
			tableName,
			cursor = "",
			limit = 50,
			direction = "asc",
			sort = [],
			order = "asc",
			filters = [],
		} = params;

		let sortColumns: string[] = [];
		let effectiveSortDirection: SortDirection = order;
		if (Array.isArray(sort) && sort.length > 0) {
			sortColumns = sort.map((s) => s.columnName);
			effectiveSortDirection = sort[0].direction;
		} else if (typeof sort === "string" && sort) {
			sortColumns = [sort];
		}
		if (!sortColumns.length) sortColumns = ["rowid"];

		const { clause: filterWhere, values: filterValues } = buildWhereClause(filters);

		let cursorWhere = "";
		let cursorValues: unknown[] = [];
		if (cursor) {
			const cursorData = this.decodeCursor(cursor);
			if (cursorData) {
				const res = buildCursorWhereClause(cursorData, direction, effectiveSortDirection);
				cursorWhere = res.clause;
				cursorValues = res.values;
			}
		}

		let combinedWhere = "";
		if (filterWhere && cursorWhere) {
			combinedWhere = `WHERE ${filterWhere.replace(/^WHERE\s+/i, "")} AND ${cursorWhere}`;
		} else if (filterWhere) {
			combinedWhere = filterWhere;
		} else if (cursorWhere) {
			combinedWhere = `WHERE ${cursorWhere}`;
		}

		const sortClause = buildSortClause(Array.isArray(sort) ? sort : sort, order);
		let effectiveSortClause = sortClause;

		if (direction === "desc") {
			if (sortClause) {
				effectiveSortClause = sortClause
					.replace(/\bASC\b/gi, "TEMP_DESC")
					.replace(/\bDESC\b/gi, "ASC")
					.replace(/TEMP_DESC/g, "DESC");
			} else {
				effectiveSortClause = `ORDER BY ${sortColumns.map((col) => `"${col}" ${effectiveSortDirection === "asc" ? "DESC" : "ASC"}`).join(", ")}`;
			}
		} else if (!sortClause) {
			effectiveSortClause = `ORDER BY ${sortColumns.map((col) => `"${col}" ${effectiveSortDirection.toUpperCase()}`).join(", ")}`;
		}

		const sql = `SELECT * FROM "${tableName}" ${combinedWhere} ${effectiveSortClause} LIMIT ?`;
		const values = [...filterValues, ...cursorValues, limit + 1];
		const countSql = `SELECT COUNT(*) as total FROM "${tableName}" ${filterWhere}`;

		return { sql, values, countSql, countValues: filterValues };
	}

	protected normalizeRows(rawRows: unknown[]): NormalizedRow[] {
		return (rawRows as Record<string, unknown>[]).map((row) => this.normalizeRow(row));
	}

	protected buildCursors(
		params: GetTableDataParams,
		rows: NormalizedRow[],
		hasMore: boolean,
	): { nextCursor: string | null; prevCursor: string | null } {
		if (!rows.length) return { nextCursor: null, prevCursor: null };

		const { direction = "asc", sort = [], cursor } = params;
		let sortColumns: string[] = [];
		if (Array.isArray(sort) && sort.length > 0) {
			sortColumns = sort.map((s) => s.columnName);
		} else if (typeof sort === "string" && sort) {
			sortColumns = [sort];
		}
		if (!sortColumns.length) sortColumns = ["rowid"];

		const createCursor = (row: NormalizedRow): string => {
			const data: CursorData = {
				values: Object.fromEntries(sortColumns.map((col) => [col, row[col]])),
				sortColumns,
			};
			return this.encodeCursor(data);
		};

		const firstRow = rows[0];
		const lastRow = rows[rows.length - 1];
		let nextCursor: string | null = null;
		let prevCursor: string | null = null;

		if (direction === "asc") {
			if (hasMore) nextCursor = createCursor(lastRow);
			if (cursor) prevCursor = createCursor(firstRow);
		} else {
			if (cursor) nextCursor = createCursor(lastRow);
			if (hasMore) prevCursor = createCursor(firstRow);
		}

		return { nextCursor, prevCursor };
	}

	// =========================================================
	// Override getTableData to use primary key columns for stable pagination
	// =========================================================

	override async getTableData(params: GetTableDataParams) {
		try {
			const {
				tableName,
				db,
				limit = 50,
				direction = "asc",
				sort = [],
				order = "asc",
				cursor,
				filters = [],
			} = params;

			const client = await getSqliteClient();

			const colInfoRows = await all<TableInfoRow>(client, `PRAGMA table_info("${tableName}")`);
			const pkColumns: string[] = colInfoRows
				.filter((c) => c.pk > 0)
				.sort((a, b) => a.pk - b.pk)
				.map((c) => c.name);

			let sortColumns: string[] = [];
			let effectiveSortDirection: SortDirection = order;
			if (Array.isArray(sort) && sort.length > 0) {
				sortColumns = sort.map((s) => s.columnName);
				effectiveSortDirection = sort[0].direction;
			} else if (typeof sort === "string" && sort) {
				sortColumns = [sort];
			}

			const cursorColumns = [
				...sortColumns,
				...pkColumns.filter((pk) => !sortColumns.includes(pk)),
			];
			const useRowid = cursorColumns.length === 0;
			if (useRowid) cursorColumns.push("rowid");

			const { clause: filterWhere, values: filterValues } = buildWhereClause(filters);

			let cursorWhere = "";
			let cursorValues: unknown[] = [];
			if (cursor) {
				const cursorData = this.decodeCursor(cursor);
				if (cursorData) {
					const res = buildCursorWhereClause(cursorData, direction, effectiveSortDirection);
					cursorWhere = res.clause;
					cursorValues = res.values;
				}
			}

			let combinedWhere = "";
			if (filterWhere && cursorWhere) {
				combinedWhere = `WHERE ${filterWhere.replace(/^WHERE\s+/i, "")} AND ${cursorWhere}`;
			} else if (filterWhere) {
				combinedWhere = filterWhere;
			} else if (cursorWhere) {
				combinedWhere = `WHERE ${cursorWhere}`;
			}

			const sortClause = buildSortClause(Array.isArray(sort) ? sort : sort, order);
			const pkTieBreakerCols = pkColumns.filter((pk) => !sortColumns.includes(pk));
			let effectiveSortClause = sortClause;

			if (direction === "desc") {
				if (sortClause) {
					effectiveSortClause = sortClause
						.replace(/\bASC\b/gi, "TEMP_DESC")
						.replace(/\bDESC\b/gi, "ASC")
						.replace(/TEMP_DESC/g, "DESC");
					if (pkTieBreakerCols.length) {
						const tbDir = effectiveSortDirection === "asc" ? "DESC" : "ASC";
						effectiveSortClause += `, ${pkTieBreakerCols.map((col) => `"${col}" ${tbDir}`).join(", ")}`;
					}
				} else {
					effectiveSortClause = `ORDER BY ${cursorColumns.map((col) => `"${col}" ${effectiveSortDirection === "asc" ? "DESC" : "ASC"}`).join(", ")}`;
				}
			} else if (!sortClause) {
				effectiveSortClause = `ORDER BY ${cursorColumns.map((col) => `"${col}" ${effectiveSortDirection.toUpperCase()}`).join(", ")}`;
			} else if (pkTieBreakerCols.length) {
				effectiveSortClause += `, ${pkTieBreakerCols.map((col) => `"${col}" ${effectiveSortDirection.toUpperCase()}`).join(", ")}`;
			}

			const [countRow] = await all<{ total: number }>(
				client,
				`SELECT COUNT(*) as total FROM "${tableName}" ${filterWhere}`,
				filterValues,
			);
			const total = Number(countRow?.total ?? 0);

			// When falling back to rowid for cursor, include it in SELECT so buildCursors can read it
			const selectClause = useRowid ? "*, rowid" : "*";
			const dataRows = await all(
				client,
				`SELECT ${selectClause} FROM "${tableName}" ${combinedWhere} ${effectiveSortClause} LIMIT ?`,
				[...filterValues, ...cursorValues, limit + 1],
			);

			const hasMore = dataRows.length > limit;
			let rows = hasMore ? dataRows.slice(0, limit) : dataRows;
			if (direction === "desc") rows = rows.reverse();

			const createCursor = (row: Record<string, unknown>): CursorData => ({
				values: Object.fromEntries(cursorColumns.map((col) => [col, row[col]])),
				sortColumns: cursorColumns,
			});

			let nextCursor: string | null = null;
			let prevCursor: string | null = null;

			if (rows.length > 0) {
				const firstRow = rows[0];
				const lastRow = rows[rows.length - 1];
				if (direction === "asc") {
					if (hasMore) nextCursor = this.encodeCursor(createCursor(lastRow));
					if (cursor) prevCursor = this.encodeCursor(createCursor(firstRow));
				} else {
					if (cursor) nextCursor = this.encodeCursor(createCursor(lastRow));
					if (hasMore) prevCursor = this.encodeCursor(createCursor(firstRow));
				}
			}

			// Strip the synthetic rowid from output rows if we added it
			const finalRows = useRowid ? rows.map(({ rowid: _r, ...rest }) => rest) : rows;

			void db;
			return {
				data: finalRows as NormalizedRow[],
				meta: {
					limit,
					total,
					hasNextPage: direction === "asc" ? hasMore : !!cursor,
					hasPreviousPage: direction === "asc" ? !!cursor : hasMore,
					nextCursor,
					prevCursor,
				},
			};
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	// =========================================================
	// IDbAdapter — Databases
	// =========================================================

	async getDatabasesList(): Promise<DatabaseInfoSchemaType[]> {
		try {
			const client = await getSqliteClient();
			const rows = await all<{ seq: number; name: string; file: string }>(
				client,
				"PRAGMA database_list",
			);

			if (!rows.length)
				throw new HTTPException(500, { message: "No databases returned from SQLite" });

			// Hide SQLite's internal temp database. `PRAGMA database_list` always
			// reports `main`, so filtering can never empty the list.
			return rows
				.filter((row) => row.name !== "temp")
				.map((row) => ({
					name: row.name,
					// A remote server reports its own filesystem path; there is nothing local to stat.
					size: client.protocol === "file" ? this.getFileSize(row.file) : "N/A",
					owner: "",
					encoding: "UTF-8",
				}));
		} catch (e) {
			if (e instanceof HTTPException) throw e;
			throw this.wrapError(e);
		}
	}

	async getCurrentDatabase(): Promise<DatabaseSchemaType> {
		try {
			const rows = await all<{ name: string }>(
				await getSqliteClient(),
				"PRAGMA database_list",
			);
			const main = rows.find((r) => r.name === "main");
			return { db: main?.name ?? "main" };
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	async getDatabaseConnectionInfo(): Promise<ConnectionInfoSchemaType> {
		try {
			const [versionRow] = await all<{ version: string }>(
				await getSqliteClient(),
				"SELECT sqlite_version() as version",
			);

			return {
				host: null,
				port: null,
				user: "",
				database: "main",
				version: `SQLite ${versionRow.version}`,
				active_connections: 1,
				max_connections: 1,
			};
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	// =========================================================
	// IDbAdapter — Tables
	// =========================================================

	async getTablesList(_db: DatabaseSchemaType["db"]): Promise<TableInfoSchemaType[]> {
		try {
			const client = await getSqliteClient();
			const tables = await all<{ name: string }>(
				client,
				`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
			);
			if (!tables.length) return [];

			// One round trip for every count; matters against a remote server.
			const counts = await client.batch(
				tables.map((t) => `SELECT COUNT(*) as count FROM ${this.quoteIdentifier(t.name)}`),
				"read",
			);
			return tables.map((t, i) => ({
				tableName: t.name,
				rowCount: toRows<{ count: number }>(counts[i])[0]?.count ?? 0,
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

		const columnDefs = fields.map((field: FieldDataType) => {
			// SQLite AUTOINCREMENT requires "INTEGER PRIMARY KEY AUTOINCREMENT"
			if (field.isPrimaryKey && field.isIdentity) {
				return `"${field.columnName}" INTEGER PRIMARY KEY AUTOINCREMENT`;
			}
			let def = `"${field.columnName}" ${field.columnType}`;
			if (field.isPrimaryKey) def += " PRIMARY KEY";
			if (field.isUnique && !field.isPrimaryKey) def += " UNIQUE";
			if (!field.isNullable && !field.isPrimaryKey) def += " NOT NULL";
			if (field.defaultValue?.trim() && !field.isIdentity)
				def += ` DEFAULT ${field.defaultValue.trim()}`;
			return def;
		});

		const fkDefs =
			foreignKeys?.map(
				(fk: ForeignKeyDataType) =>
					`FOREIGN KEY ("${fk.columnName}") REFERENCES "${fk.referencedTable}" ("${fk.referencedColumn}") ON UPDATE ${fk.onUpdate} ON DELETE ${fk.onDelete}`,
			) ?? [];

		const client = await getSqliteClient();
		await client.execute(
			`CREATE TABLE "${tableName}" (${[...columnDefs, ...fkDefs].join(", ")})`,
		);

		void db;
	}

	async deleteTable(params: DeleteTableParams): Promise<DeleteTableResult> {
		const { tableName, cascade } = params;
		const client = await getSqliteClient();

		if (!(await this.tableExists(client, tableName)))
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });

		const [countRow] = await all<{ count: number }>(
			client,
			`SELECT COUNT(*) as count FROM "${tableName}"`,
		);
		const rowCount = countRow?.count ?? 0;

		if (!cascade) {
			const related = await this.getFkReferencesForTable(client, tableName);
			if (related.length > 0) {
				return {
					deletedCount: 0,
					fkViolation: true,
					relatedRecords: await this.getRelatedRecordsForTable(client, tableName),
				};
			}
		}

		try {
			await client.execute(`DROP TABLE "${tableName}"`);
			return { deletedCount: rowCount, fkViolation: false, relatedRecords: [] };
		} catch (error) {
			const errMsg = error instanceof Error ? error.message : String(error);
			if (errMsg.includes("FOREIGN KEY constraint")) {
				return {
					deletedCount: 0,
					fkViolation: true,
					relatedRecords: await this.getRelatedRecordsForTable(client, tableName),
				};
			}
			if (error instanceof HTTPException) throw error;
			throw new HTTPException(500, { message: `Failed to delete table "${tableName}"` });
		}
	}

	async renameTable(params: RenameTableParamsSchemaType): Promise<void> {
		const { tableName, newTableName, db } = params;
		this.assertDifferentTableName(tableName, newTableName);
		const client = await getSqliteClient();

		if (!(await this.tableExists(client, tableName)))
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });

		if (await this.tableExists(client, newTableName))
			throw new HTTPException(409, {
				message: `Table "${newTableName}" already exists`,
			});

		try {
			await client.execute(
				`ALTER TABLE ${this.quoteIdentifier(tableName)} RENAME TO ${this.quoteIdentifier(newTableName)}`,
			);
		} catch (e) {
			throw this.wrapError(e);
		}

		void db;
	}

	async getTableSchema({
		tableName,
		db,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<string> {
		try {
			const [row] = await all<{ sql: string }>(
				await getSqliteClient(),
				`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`,
				[tableName],
			);
			if (!row)
				throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });
			void db;
			return row.sql;
		} catch (e) {
			if (e instanceof HTTPException) throw e;
			throw this.wrapError(e);
		}
	}

	// =========================================================
	// IDbAdapter — Columns
	// =========================================================

	async getTableColumns({
		tableName,
		db,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<ColumnInfoSchemaType[]> {
		try {
			const client = await getSqliteClient();

			if (!(await this.tableExists(client, tableName)))
				throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });

			const columns = await all<TableInfoRow>(client, `PRAGMA table_info("${tableName}")`);
			const fks = await all<FkRow>(client, `PRAGMA foreign_key_list("${tableName}")`);

			const fkMap = new Map<string, FkRow>();
			for (const fk of fks) {
				fkMap.set(fk.from, fk);
			}

			void db;
			return columns.map((col) => {
				const fk = fkMap.get(col.name);
				const nativeType = col.type.toLowerCase();
				return {
					columnName: col.name,
					dataType: mapSqliteToDataType(nativeType),
					dataTypeLabel: standardizeSqliteDataTypeLabel(nativeType),
					isNullable: col.notnull === 0 && col.pk === 0,
					columnDefault: col.dflt_value,
					isPrimaryKey: col.pk > 0,
					isForeignKey: fkMap.has(col.name),
					referencedTable: fk?.table ?? null,
					referencedColumn: fk?.to ?? null,
					enumValues: null,
				};
			});
		} catch (e) {
			if (e instanceof HTTPException) throw e;
			throw this.wrapError(e);
		}
	}

	async addColumn(params: AddColumnParamsSchemaType): Promise<void> {
		return this.serializeSchemaChange(async () => {
			const { tableName, columnName, columnType, defaultValue, isNullable, isUnique, db } =
				params;
			const client = await getSqliteClient();

			if (!(await this.tableExists(client, tableName)))
				throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });

			const colInfo = await all<TableInfoRow>(client, `PRAGMA table_info("${tableName}")`);
			if (colInfo.some((c) => c.name === columnName)) {
				throw new HTTPException(409, {
					message: `Column "${columnName}" already exists in table "${tableName}"`,
				});
			}

			let def = `"${columnName}" ${columnType}`;
			if (isUnique) def += " UNIQUE";
			if (!isNullable) def += " NOT NULL";
			if (defaultValue?.trim()) def += ` DEFAULT ${defaultValue.trim()}`;

			try {
				await client.execute(`ALTER TABLE "${tableName}" ADD COLUMN ${def}`);
			} catch (e) {
				throw this.wrapError(e);
			}

			void db;
		});
	}

	async deleteColumn(params: DeleteColumnParamsSchemaType): Promise<{ deletedCount: number }> {
		return this.serializeSchemaChange(async () => {
			const { tableName, columnName, db } = params;
			const client = await getSqliteClient();

			if (!(await this.tableExists(client, tableName)))
				throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });

			const colInfo = await all<TableInfoRow>(client, `PRAGMA table_info("${tableName}")`);
			if (!colInfo.some((c) => c.name === columnName)) {
				throw new HTTPException(404, {
					message: `Column "${columnName}" does not exist in table "${tableName}"`,
				});
			}

			try {
				await client.execute(`ALTER TABLE "${tableName}" DROP COLUMN "${columnName}"`);
			} catch (e) {
				throw this.wrapError(e);
			}

			void db;
			return { deletedCount: 1 };
		});
	}

	async alterColumn(params: AlterColumnParamsSchemaType): Promise<void> {
		return this.serializeSchemaChange(async () => {
			const { tableName, columnName, columnType, isNullable, defaultValue, db } = params;
			const client = await getSqliteClient();
			const q = (name: string) => this.quoteIdentifier(name);

			if (!(await this.tableExists(client, tableName)))
				throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });

			const colInfo = await all<TableInfoRow>(client, `PRAGMA table_info(${q(tableName)})`);
			if (!colInfo.some((c) => c.name === columnName)) {
				throw new HTTPException(404, {
					message: `Column "${columnName}" does not exist in table "${tableName}"`,
				});
			}

			// SQLite doesn't support ALTER COLUMN — use the recreate-table approach
			const pkCols = colInfo.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk);
			const hasCompositePk = pkCols.length > 1;

			const newColDefs = colInfo.map((col) => {
				const isTarget = col.name === columnName;
				const type = isTarget ? columnType : col.type;
				const nullable = isTarget ? isNullable : col.notnull === 0;
				const defVal = isTarget ? defaultValue?.trim() || null : col.dflt_value;
				const isPk = col.pk > 0;

				let def = `${q(col.name)} ${type}`;
				if (!hasCompositePk && isPk) def += " PRIMARY KEY";
				if (!isPk && !nullable) def += " NOT NULL";
				if (defVal) def += ` DEFAULT ${defVal}`;
				return def;
			});

			if (hasCompositePk) {
				newColDefs.push(`PRIMARY KEY (${pkCols.map((c) => q(c.name)).join(", ")})`);
			}

			const fks = await all<FkRow>(client, `PRAGMA foreign_key_list(${q(tableName)})`);
			const fksByGroup = new Map<number, FkRow[]>();
			for (const fk of fks) {
				const arr = fksByGroup.get(fk.id) ?? [];
				arr.push(fk);
				fksByGroup.set(fk.id, arr);
			}
			const fkDefs = Array.from(fksByGroup.values()).map((group) => {
				const from = group.map((f) => q(f.from)).join(", ");
				const toColumns = group.map((f) => f.to);
				const to = allNamed(toColumns) ? ` (${toColumns.map(q).join(", ")})` : "";
				const { table, on_update, on_delete } = group[0];
				return `FOREIGN KEY (${from}) REFERENCES ${q(table)}${to} ON UPDATE ${on_update} ON DELETE ${on_delete}`;
			});

			const colNames = colInfo.map((c) => q(c.name)).join(", ");
			const tempName = `${tableName}_alter_${Date.now()}`;

			const existingIndexes = await all<{ sql: string }>(
				client,
				`SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL`,
				[tableName],
			);
			const existingTriggers = await all<{ sql: string }>(
				client,
				`SELECT sql FROM sqlite_master WHERE type='trigger' AND tbl_name=?`,
				[tableName],
			);

			// DROP TABLE runs an implicit DELETE, which would fire ON DELETE CASCADE on child
			// tables, so foreign keys must be off. That PRAGMA is a no-op inside a transaction
			// and does not outlive one request on a remote server; migrate() turns it off,
			// runs the statements in one transaction on one connection, and turns it back on
			// even when a statement fails.
			try {
				await client.migrate([
					`CREATE TABLE ${q(tempName)} (${[...newColDefs, ...fkDefs].join(", ")})`,
					`INSERT INTO ${q(tempName)} (${colNames}) SELECT ${colNames} FROM ${q(tableName)}`,
					`DROP TABLE ${q(tableName)}`,
					`ALTER TABLE ${q(tempName)} RENAME TO ${q(tableName)}`,
					...existingIndexes.map(({ sql }) => sql),
					...existingTriggers.map(({ sql }) => sql),
				]);
			} catch (e) {
				throw this.wrapError(e);
			}

			void db;
		});
	}

	async renameColumn(params: RenameColumnParamsSchemaType): Promise<void> {
		return this.serializeSchemaChange(async () => {
			const { tableName, columnName, newColumnName, db } = params;
			const client = await getSqliteClient();

			if (!(await this.tableExists(client, tableName)))
				throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });

			const colInfo = await all<TableInfoRow>(client, `PRAGMA table_info("${tableName}")`);
			if (!colInfo.some((c) => c.name === columnName)) {
				throw new HTTPException(404, {
					message: `Column "${columnName}" does not exist in table "${tableName}"`,
				});
			}
			if (colInfo.some((c) => c.name === newColumnName)) {
				throw new HTTPException(409, {
					message: `Column "${newColumnName}" already exists in table "${tableName}"`,
				});
			}

			try {
				await client.execute(
					`ALTER TABLE "${tableName}" RENAME COLUMN "${columnName}" TO "${newColumnName}"`,
				);
			} catch (e) {
				throw this.wrapError(e);
			}

			void db;
		});
	}

	// =========================================================
	// IDbAdapter — Records
	// =========================================================

	async addRecord({
		params,
	}: {
		params: AddRecordSchemaType;
	}): Promise<{ insertedCount: number }> {
		const { tableName, data } = params;
		const columns = Object.keys(data);
		if (!columns.length)
			throw new HTTPException(400, { message: "No data provided for insert" });

		const colNames = columns.map((c) => `"${c}"`).join(", ");
		const placeholders = columns.map(() => "?").join(", ");

		try {
			const client = await getSqliteClient();
			const result = await client.execute(
				stmt(
					`INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders})`,
					Object.values(data),
				),
			);
			if (result.rowsAffected === 0)
				throw new HTTPException(500, {
					message: `Failed to insert record into "${tableName}"`,
				});
			return { insertedCount: result.rowsAffected };
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	async updateRecords({
		db,
		params,
	}: {
		db: DatabaseSchemaType["db"];
		params: UpdateRecordsSchemaType;
	}): Promise<{ updatedCount: number }> {
		const { tableName } = params;

		const keyColumns = this.resolveKeyColumns(params);
		const groups = this.groupUpdatesByKey(params, keyColumns);

		try {
			const tx = await (await getSqliteClient()).transaction("write");
			try {
				let total = 0;
				for (const { keyValues, rowUpdates } of groups) {
					const setClauses = rowUpdates.map((u) => `"${u.columnName}" = ?`).join(", ");
					const whereClauses = keyColumns.map((column) => `"${column}" = ?`).join(" AND ");
					const result = await tx.execute(
						stmt(`UPDATE "${tableName}" SET ${setClauses} WHERE ${whereClauses}`, [
							...rowUpdates.map((u) => u.value),
							...keyValues,
						]),
					);
					if (result.rowsAffected === 0) {
						throw new HTTPException(404, {
							message: `Record with ${this.describeKey(keyColumns, keyValues)} not found in table "${tableName}"`,
						});
					}
					total += result.rowsAffected;
				}
				await tx.commit();
				void db;
				return { updatedCount: total };
			} catch (e) {
				await tx.rollback();
				throw e;
			} finally {
				tx.close();
			}
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	async deleteRecords({
		tableName,
		primaryKeys,
		db,
	}: DeleteRecordParams): Promise<DeleteRecordResult> {
		const pkColumn = primaryKeys[0]?.columnName;
		if (!pkColumn)
			throw new HTTPException(400, { message: "Primary key column name is required" });

		const pkValues = primaryKeys.map((pk) => pk.value);
		const placeholders = pkValues.map(() => "?").join(", ");
		const client = await getSqliteClient();

		try {
			const result = await client.execute(
				stmt(`DELETE FROM "${tableName}" WHERE "${pkColumn}" IN (${placeholders})`, pkValues),
			);
			void db;
			return { deletedCount: result.rowsAffected, fkViolation: false, relatedRecords: [] };
		} catch (e) {
			if (isFkViolation(e)) {
				const relatedRecords = await this.getRelatedRecords(client, tableName, primaryKeys);
				void db;
				return { deletedCount: 0, fkViolation: true, relatedRecords };
			}
			throw this.wrapError(e);
		}
	}

	/**
	 * Deletes the rows and, children first, every row that references them through any chain
	 * of foreign keys. Each table's rows are selected by a predicate nested on its parent's,
	 * so the plan is a list of plain DELETEs that run as one write batch (one transaction).
	 * A foreign key cycle is not followed; rows it still references make the batch fail
	 * and roll back instead of leaving orphans.
	 */
	async forceDeleteRecords({
		tableName,
		primaryKeys,
		db,
	}: DeleteRecordParams): Promise<{ deletedCount: number }> {
		const pkColumn = primaryKeys[0]?.columnName;
		if (!pkColumn)
			throw new HTTPException(400, { message: "Primary key column name is required" });

		const q = (name: string) => this.quoteIdentifier(name);
		const pkValues = primaryKeys.map((pk) => pk.value);
		const rootPredicate = `${q(pkColumn)} IN (${pkValues.map(() => "?").join(", ")})`;

		try {
			const client = await getSqliteClient();
			const fksByParent = await this.getForeignKeysByParent(client);
			const deletes: InStatement[] = [];

			const plan = async (table: string, predicate: string, path: string[]) => {
				for (const fk of fksByParent.get(table) ?? []) {
					if (path.includes(fk.childTable)) continue;
					const parentCols = allNamed(fk.parentColumns)
						? fk.parentColumns
						: await this.getPrimaryKeyColumns(client, table);
					const childPredicate = `(${fk.childColumns.map(q).join(", ")}) IN (SELECT ${parentCols.map(q).join(", ")} FROM ${q(table)} WHERE ${predicate})`;
					await plan(fk.childTable, childPredicate, [...path, fk.childTable]);
				}
				deletes.push(stmt(`DELETE FROM ${q(table)} WHERE ${predicate}`, pkValues));
			};
			await plan(tableName, rootPredicate, [tableName]);

			const results = await client.batch(deletes, "write");
			void db;
			return { deletedCount: results.reduce((sum, r) => sum + r.rowsAffected, 0) };
		} catch (e) {
			if (isFkViolation(e))
				throw new HTTPException(409, {
					message: `Cannot force delete from "${tableName}": rows are still referenced through a foreign key cycle`,
				});
			throw this.wrapError(e);
		}
	}

	async bulkInsertRecords({
		tableName,
		records,
		db,
	}: BulkInsertRecordsParams): Promise<BulkInsertResult> {
		if (!records?.length)
			throw new HTTPException(400, { message: "At least one record is required" });

		const columns = Object.keys(records[0]);
		const colNames = columns.map((c) => `"${c}"`).join(", ");
		const placeholders = columns.map(() => "?").join(", ");
		const sql = `INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders})`;

		try {
			const client = await getSqliteClient();
			await client.batch(
				records.map((record) =>
					stmt(
						sql,
						columns.map((col) => record[col]),
					),
				),
				"write",
			);
			void db;
			return {
				success: true,
				message: `Bulk insert completed: ${records.length} records inserted`,
				successCount: records.length,
				failureCount: 0,
			};
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	// =========================================================
	// IDbAdapter — Query
	// =========================================================

	async executeQuery({
		query,
		db,
	}: {
		query: string;
		db: DatabaseSchemaType["db"];
	}): Promise<ExecuteQueryResult> {
		if (!query?.trim()) throw new HTTPException(400, { message: "Query is required" });

		const cleaned = query.trim().replace(/;+$/, "");
		const start = performance.now();

		try {
			const result = await (await getSqliteClient()).execute(cleaned);
			const duration = performance.now() - start;
			void db;
			// Statements that return rows report their columns even when no row matches.
			if (result.columns.length > 0) {
				const rows = toRows(result);
				return {
					columns: result.columns,
					rows,
					rowCount: rows.length,
					duration,
					message: rows.length === 0 ? "OK" : undefined,
				};
			}
			return {
				columns: [],
				rows: [],
				rowCount: result.rowsAffected,
				duration,
				message: `OK (${result.rowsAffected} rows affected)`,
			};
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	// =========================================================
	// Private helpers
	// =========================================================

	private async tableExists(client: SqlExecutor, tableName: string): Promise<boolean> {
		const rows = await all(
			client,
			`SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
			[tableName],
		);
		return rows.length > 0;
	}

	private async getPrimaryKeyColumns(client: SqlExecutor, tableName: string) {
		const cols = await all<TableInfoRow>(
			client,
			`PRAGMA table_info(${this.quoteIdentifier(tableName)})`,
		);
		return cols
			.filter((c) => c.pk > 0)
			.sort((a, b) => a.pk - b.pk)
			.map((c) => c.name);
	}

	/** Every foreign key in the database, keyed by the table it references. */
	private async getForeignKeysByParent(
		client: SqlExecutor,
	): Promise<Map<string, ForeignKeyEdge[]>> {
		const rows = await all<{
			child: string;
			id: number;
			parent: string;
			from: string;
			to: string | null;
		}>(
			client,
			`SELECT m.name AS child, f.id, f."table" AS parent, f."from", f."to"
			FROM sqlite_master m JOIN pragma_foreign_key_list(m.name) f
			WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%'
			ORDER BY m.name, f.id, f.seq`,
		);
		const byConstraint = new Map<string, ForeignKeyEdge>();
		const byParent = new Map<string, ForeignKeyEdge[]>();
		for (const row of rows) {
			const key = `${row.child}\u0000${row.id}`;
			let fk = byConstraint.get(key);
			if (!fk) {
				fk = { childTable: row.child, childColumns: [], parentColumns: [] };
				byConstraint.set(key, fk);
				byParent.set(row.parent, [...(byParent.get(row.parent) ?? []), fk]);
			}
			fk.childColumns.push(row.from);
			fk.parentColumns.push(row.to);
		}
		return byParent;
	}

	private getFileSize(filePath: string): string {
		if (!filePath) return "in-memory";
		try {
			const stats = statSync(filePath);
			const bytes = stats.size;
			if (bytes < 1024) return `${bytes} B`;
			if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
			return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		} catch {
			return "N/A";
		}
	}

	private async getFkReferencesForTable(
		client: SqlExecutor,
		tableName: string,
	): Promise<ForeignKeyConstraint[]> {
		const fks = await all<{ child: string; from: string; to: string | null }>(
			client,
			`SELECT m.name AS child, f."from", f."to"
			FROM sqlite_master m JOIN pragma_foreign_key_list(m.name) f
			WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name != ? AND f."table" = ?`,
			[tableName, tableName],
		);
		return fks.map((fk) => ({
			constraintName: `fk_${fk.child}_${fk.from}_${tableName}_${fk.to}`,
			referencingTable: fk.child,
			referencingColumn: fk.from,
			referencedTable: tableName,
			referencedColumn: fk.to ?? "",
		}));
	}

	private async getRelatedRecordsForTable(
		client: SqlExecutor,
		tableName: string,
	): Promise<RelatedRecord[]> {
		const fks = await this.getFkReferencesForTable(client, tableName);
		const results: RelatedRecord[] = [];
		for (const fk of fks) {
			const rows = await all(client, `SELECT * FROM "${fk.referencingTable}" LIMIT 100`);
			if (rows.length > 0) {
				results.push({
					tableName: fk.referencingTable,
					columnName: fk.referencingColumn,
					constraintName: fk.constraintName,
					records: rows,
				});
			}
		}
		return results;
	}

	private async getRelatedRecords(
		client: SqlExecutor,
		tableName: string,
		primaryKeys: DeleteRecordParams["primaryKeys"],
	): Promise<RelatedRecord[]> {
		const fks = await this.getFkReferencesForTable(client, tableName);
		const results: RelatedRecord[] = [];
		for (const fk of fks) {
			const matchingPk = primaryKeys.find((pk) => pk.columnName === fk.referencedColumn);
			if (!matchingPk) continue;
			const pkValues = primaryKeys.map((pk) => pk.value);
			const ph = pkValues.map(() => "?").join(", ");
			const rows = await all(
				client,
				`SELECT * FROM "${fk.referencingTable}" WHERE "${fk.referencingColumn}" IN (${ph}) LIMIT 100`,
				pkValues,
			);
			if (rows.length > 0) {
				results.push({
					tableName: fk.referencingTable,
					columnName: fk.referencingColumn,
					constraintName: fk.constraintName,
					records: rows,
				});
			}
		}
		return results;
	}
}
