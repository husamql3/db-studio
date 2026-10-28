import type {
	AddColumnParamsSchemaType,
	AddRecordSchemaType,
	AlterColumnParamsSchemaType,
	BulkInsertRecordsParams,
	BulkInsertResult,
	ColumnInfoSchemaType,
	ConnectionInfoSchemaType,
	CreateIndexParamsSchemaType,
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
	DropIndexParamsSchemaType,
	ExecuteQueryResult,
	FieldDataType,
	ForeignKeyConstraint,
	ForeignKeyDataType,
	IndexInfoSchemaType,
	RelatedRecord,
	RenameColumnParamsSchemaType,
	RenameTableParamsSchemaType,
	SortDirection,
	TableInfoSchemaType,
	UpdateRecordsSchemaType,
} from "@db-studio/shared/types";
import { mapSqliteToDataType, standardizeSqliteDataTypeLabel } from "@db-studio/shared/types";
import type { Value } from "@libsql/client";
import type { GetTableDataParams } from "@/adapters/adapter.interface.js";
import { BaseAdapter, type NormalizedRow, type QueryBundle } from "@/adapters/base.adapter.js";
import { getSqliteClient } from "@/adapters/connections.js";
import { HTTPException } from "@/http-exception.js";
import type { SqliteClient, SqlParam, SqlResult, SqlStatement } from "@/sqlite-client.js";
import {
	buildCursorWhereClause,
	buildSortClause,
	buildWhereClause,
	hasMultipleStatements,
	isTransactionControl,
	recreateTableWithColumn,
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

interface IndexKeyRow {
	indexName: string;
	isUnique: number;
	/** c: CREATE INDEX, u: UNIQUE constraint, pk: PRIMARY KEY */
	origin: string;
	partial: number;
	sql: string | null;
	seqno: number;
	/** -2 marks an expression key, which has no column name */
	cid: number;
	columnName: string | null;
}

const QUOTE_END: Record<string, string> = { "'": "'", '"': '"', "`": "`", "[": "]" };

/**
 * The key list of a CREATE INDEX statement, split at its top-level commas. PRAGMA index_xinfo
 * names no expression keys, so their text has to come from the statement itself.
 */
const indexKeyParts = (sql: string): string[] => {
	const parts: string[] = [];
	let depth = 0;
	let start = -1;
	for (let i = 0; i < sql.length; i++) {
		const char = sql[i] ?? "";
		const end = QUOTE_END[char];
		if (end) {
			i = sql.indexOf(end, i + 1);
			if (i === -1) break;
		} else if (char === "-" && sql[i + 1] === "-") {
			i = sql.indexOf("\n", i + 2);
			if (i === -1) break;
		} else if (char === "/" && sql[i + 1] === "*") {
			const endComment = sql.indexOf("*/", i + 2);
			if (endComment === -1) break;
			i = endComment + 1;
		} else if (char === "(") {
			if (depth++ === 0) start = i + 1;
		} else if (char === ")" && --depth === 0) {
			parts.push(sql.slice(start, i).trim());
			break;
		} else if (char === "," && depth === 1) {
			parts.push(sql.slice(start, i).trim());
			start = i + 1;
		}
	}
	return parts;
};

const allNamed = (columns: (string | null)[]): columns is string[] =>
	columns.every((c) => c !== null);

const toSqliteValue = (value: unknown): SqlParam => {
	if (value === null || value === undefined) return null;
	if (typeof value === "boolean") return value ? 1 : 0;
	if (typeof value === "string" || typeof value === "number" || typeof value === "bigint")
		return value;
	if (value instanceof Date) return value.toISOString();
	return JSON.stringify(value);
};

const stmt = (sql: string, values: unknown[] = []): SqlStatement => ({
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

const toRows = <T = Record<string, unknown>>({ columns, rows }: SqlResult): T[] =>
	rows.map(
		(row) => Object.fromEntries(columns.map((col, i) => [col, fromSqliteValue(row[i])])) as T,
	);

const all = async <T = Record<string, unknown>>(
	client: SqliteClient,
	sql: string,
	values: unknown[] = [],
): Promise<T[]> => toRows<T>(await client.execute(stmt(sql, values)));

// The client returns the connection to its pool after every call, which rolls back
// anything left open, so a lone BEGIN would leave the next query autocommitting.
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
				effectiveSortClause = `ORDER BY ${sortColumns.map((col) => `${this.quoteIdentifier(col)} ${effectiveSortDirection === "asc" ? "DESC" : "ASC"}`).join(", ")}`;
			}
		} else if (!sortClause) {
			effectiveSortClause = `ORDER BY ${sortColumns.map((col) => `${this.quoteIdentifier(col)} ${effectiveSortDirection.toUpperCase()}`).join(", ")}`;
		}

		const sql = `SELECT * FROM ${this.quoteIdentifier(tableName)} ${combinedWhere} ${effectiveSortClause} LIMIT ?`;
		const values = [...filterValues, ...cursorValues, limit + 1];
		const countSql = `SELECT COUNT(*) as total FROM ${this.quoteIdentifier(tableName)} ${filterWhere}`;

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

			const colInfoRows = await all<TableInfoRow>(
				client,
				`PRAGMA table_info(${this.quoteIdentifier(tableName)})`,
			);
			// PRAGMA table_info returns no rows instead of failing for a dropped table or stale URL.
			if (colInfoRows.length === 0)
				throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });
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
						effectiveSortClause += `, ${pkTieBreakerCols.map((col) => `${this.quoteIdentifier(col)} ${tbDir}`).join(", ")}`;
					}
				} else {
					effectiveSortClause = `ORDER BY ${cursorColumns.map((col) => `${this.quoteIdentifier(col)} ${effectiveSortDirection === "asc" ? "DESC" : "ASC"}`).join(", ")}`;
				}
			} else if (!sortClause) {
				effectiveSortClause = `ORDER BY ${cursorColumns.map((col) => `${this.quoteIdentifier(col)} ${effectiveSortDirection.toUpperCase()}`).join(", ")}`;
			} else if (pkTieBreakerCols.length) {
				effectiveSortClause += `, ${pkTieBreakerCols.map((col) => `${this.quoteIdentifier(col)} ${effectiveSortDirection.toUpperCase()}`).join(", ")}`;
			}

			const [countRow] = await all<{ total: number }>(
				client,
				`SELECT COUNT(*) as total FROM ${this.quoteIdentifier(tableName)} ${filterWhere}`,
				filterValues,
			);
			const total = Number(countRow?.total ?? 0);

			// When falling back to rowid for cursor, include it in SELECT so buildCursors can read it
			const selectClause = useRowid ? "*, rowid" : "*";
			const dataRows = await all(
				client,
				`SELECT ${selectClause} FROM ${this.quoteIdentifier(tableName)} ${combinedWhere} ${effectiveSortClause} LIMIT ?`,
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
			const { name, size } = await (await getSqliteClient()).info();
			return [{ name, size, owner: "", encoding: "UTF-8" }];
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	async getCurrentDatabase(): Promise<DatabaseSchemaType> {
		try {
			return { db: (await (await getSqliteClient()).info()).name };
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	async getDatabaseConnectionInfo(): Promise<ConnectionInfoSchemaType> {
		try {
			const { name, version } = await (await getSqliteClient()).info();
			return {
				host: null,
				port: null,
				user: "",
				database: name,
				version,
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
				`SELECT name FROM sqlite_master
				WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*'
				ORDER BY name`,
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

		const primaryKey = fields.filter((f) => f.isPrimaryKey).map((f) => f.columnName);
		const columnDefs = fields.map((field: FieldDataType) => {
			// SQLite AUTOINCREMENT requires "INTEGER PRIMARY KEY AUTOINCREMENT"
			if (primaryKey.length === 1 && field.isPrimaryKey && field.isIdentity) {
				return `"${field.columnName}" INTEGER PRIMARY KEY AUTOINCREMENT`;
			}
			let def = `"${field.columnName}" ${field.columnType}`;
			if (primaryKey.length === 1 && field.isPrimaryKey) def += " PRIMARY KEY";
			if (field.isUnique && !field.isPrimaryKey) def += " UNIQUE";
			if (!field.isNullable && !field.isPrimaryKey) def += " NOT NULL";
			if (field.defaultValue?.trim() && !field.isIdentity)
				def += ` DEFAULT ${field.defaultValue.trim()}`;
			return def;
		});
		if (primaryKey.length > 1)
			columnDefs.push(`PRIMARY KEY (${primaryKey.map((c) => `"${c}"`).join(", ")})`);

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

			const columns = await all<TableInfoRow>(
				client,
				`PRAGMA table_info(${this.quoteIdentifier(tableName)})`,
			);
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

			const colInfo = await all<TableInfoRow>(
				client,
				`PRAGMA table_info(${this.quoteIdentifier(tableName)})`,
			);
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

			const colInfo = await all<TableInfoRow>(
				client,
				`PRAGMA table_info(${this.quoteIdentifier(tableName)})`,
			);
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
			const target = colInfo.find((c) => c.name === columnName);
			if (!target) {
				throw new HTTPException(404, {
					message: `Column "${columnName}" does not exist in table "${tableName}"`,
				});
			}

			// SQLite has no ALTER COLUMN, so the table is recreated from its own CREATE TABLE.
			// Rebuilding it from PRAGMA output instead would drop UNIQUE, CHECK, COLLATE,
			// AUTOINCREMENT and generated columns, which the PRAGMAs do not report.
			const tempName = `${tableName}_alter_${Date.now()}`;
			const [table] = await all<{ sql: string }>(
				client,
				`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`,
				[tableName],
			);
			const createTemp = recreateTableWithColumn(table?.sql ?? "", tempName, columnName, {
				type: columnType,
				notNull: !isNullable && !target.pk,
				defaultValue: defaultValue?.trim() || null,
			});
			if (!createTemp) {
				throw new HTTPException(400, {
					message: `Cannot edit columns of "${tableName}": its definition could not be read`,
				});
			}
			// Generated columns are absent from table_info and are computed again on insert.
			const colNames = colInfo.map((c) => q(c.name)).join(", ");
			// Copying rows sets the AUTOINCREMENT counter to the highest id copied; carry the old
			// one over so ids of rows deleted earlier are never handed out again.
			const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
			const keepSequence = /\bAUTOINCREMENT\b/i.test(createTemp)
				? [
						`DELETE FROM sqlite_sequence WHERE name = ${literal(tempName)}`,
						`INSERT INTO sqlite_sequence (name, seq) SELECT ${literal(tempName)}, seq FROM sqlite_sequence WHERE name = ${literal(tableName)}`,
					]
				: [];

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

			// DROP TABLE runs an implicit DELETE, which fires the foreign key actions of every
			// table that references this one, including itself: the new table's self-references
			// point at the old name until the RENAME.
			const referencedBy = new Set(
				(await this.getFkReferencesForTable(client, tableName, { includeSelf: true })).map(
					(fk) => fk.referencingTable,
				),
			);
			try {
				await client.rebuildTable(
					[
						createTemp,
						`INSERT INTO ${q(tempName)} (${colNames}) SELECT ${colNames} FROM ${q(tableName)}`,
						...keepSequence,
						`DROP TABLE ${q(tableName)}`,
						`ALTER TABLE ${q(tempName)} RENAME TO ${q(tableName)}`,
						...existingIndexes.map(({ sql }) => sql),
						...existingTriggers.map(({ sql }) => sql),
					],
					[...referencedBy],
				);
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

			const colInfo = await all<TableInfoRow>(
				client,
				`PRAGMA table_info(${this.quoteIdentifier(tableName)})`,
			);
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
	// IDbAdapter — Indexes
	// =========================================================

	async getTableIndexes({
		tableName,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<IndexInfoSchemaType[]> {
		try {
			return await this.listIndexes(await getSqliteClient(), tableName);
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	async createIndex(params: CreateIndexParamsSchemaType): Promise<void> {
		// Serialized with column changes: alterColumn rebuilds the table from the indexes it read.
		return this.serializeSchemaChange(async () => {
			const { tableName, indexName, columns, isUnique, method } = params;
			try {
				const client = await getSqliteClient();
				if (!(await this.tableExists(client, tableName)))
					throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });

				const colInfo = await all<TableInfoRow>(
					client,
					`PRAGMA table_info(${this.quoteIdentifier(tableName)})`,
				);
				const missing = columns.find((column) => !colInfo.some((c) => c.name === column));
				if (missing !== undefined)
					throw new HTTPException(400, {
						message: `Column "${missing}" does not exist in table "${tableName}"`,
					});

				if (method !== undefined)
					throw new HTTPException(400, { message: `Unsupported index method "${method}"` });

				await client.execute(
					`CREATE ${isUnique ? "UNIQUE " : ""}INDEX ${this.quoteIdentifier(indexName)} ON ${this.quoteIdentifier(tableName)} (${columns.map((column) => this.quoteIdentifier(column)).join(", ")})`,
				);
			} catch (e) {
				// Indexes share one namespace with tables, so either can already hold the name.
				if (
					e instanceof Error &&
					/already exists|there is already|UNIQUE constraint failed/.test(e.message)
				)
					throw new HTTPException(409, { message: e.message, cause: e });
				if (e instanceof Error && e.message.includes("reserved for internal use"))
					throw new HTTPException(400, { message: e.message, cause: e });
				throw this.wrapError(e);
			}
		});
	}

	async dropIndex({ tableName, indexName }: DropIndexParamsSchemaType): Promise<void> {
		return this.serializeSchemaChange(async () => {
			try {
				const client = await getSqliteClient();
				const index = (await this.listIndexes(client, tableName)).find(
					(candidate) => candidate.indexName === indexName,
				);
				if (!index)
					throw new HTTPException(404, {
						message: `Index "${indexName}" does not exist on table "${tableName}"`,
					});
				if (index.kind !== "index")
					throw new HTTPException(400, {
						message: `Index "${indexName}" backs a constraint; drop the constraint to remove it`,
					});

				await client.execute(`DROP INDEX ${this.quoteIdentifier(indexName)}`);
			} catch (e) {
				throw this.wrapError(e);
			}
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

		const where = keyColumns.map((column) => `"${column}" = ?`).join(" AND ");
		try {
			const client = await getSqliteClient();
			this.assertWholeKey(await this.getPrimaryKeyColumns(client, tableName), keyColumns);
			// A batch is one transaction, and the guard after each UPDATE fails it with an integer
			// overflow when that UPDATE matched no row, rolling back every earlier UPDATE. RAISE()
			// would name the row but only works inside a trigger.
			const statements = groups.flatMap(({ keyValues, rowUpdates }) => [
				stmt(
					`UPDATE "${tableName}" SET ${rowUpdates.map((u) => `"${u.columnName}" = ?`).join(", ")} WHERE ${where}`,
					[...rowUpdates.map((u) => u.value), ...keyValues],
				),
				"SELECT CASE WHEN changes() = 0 THEN abs(-9223372036854775808) END",
			]);
			try {
				const results = await client.batch(statements, "write");
				void db;
				return {
					updatedCount: results.reduce(
						(total, result, i) => (i % 2 === 0 ? total + result.rowsAffected : total),
						0,
					),
				};
			} catch (e) {
				if (!(e instanceof Error && e.message.includes("integer overflow"))) throw e;
				const found = await client.batch(
					groups.map(({ keyValues }) =>
						stmt(`SELECT 1 FROM "${tableName}" WHERE ${where} LIMIT 1`, keyValues),
					),
					"read",
				);
				const missing = groups.find((_, i) => found[i].rows.length === 0);
				if (!missing) throw e;
				throw new HTTPException(404, {
					message: `Record with ${this.describeKey(keyColumns, missing.keyValues)} not found in table "${tableName}"`,
				});
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
			this.assertDeletableKey(await this.getPrimaryKeyColumns(client, tableName));
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
			this.assertDeletableKey(await this.getPrimaryKeyColumns(client, tableName));
			const fksByParent = await this.getForeignKeysByParent(client);
			const deletes: SqlStatement[] = [];

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
		if (isTransactionControl(cleaned))
			throw new HTTPException(400, {
				message:
					"Transaction statements (BEGIN, COMMIT, ROLLBACK, SAVEPOINT, RELEASE) are not supported in the query runner: each query runs on its own connection, so a transaction cannot span queries.",
			});
		if (hasMultipleStatements(cleaned))
			throw new HTTPException(400, {
				message:
					"The query runner runs one statement at a time. Run each statement separately.",
			});
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

	private async tableExists(client: SqliteClient, tableName: string): Promise<boolean> {
		const rows = await all(
			client,
			`SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
			[tableName],
		);
		return rows.length > 0;
	}

	private async listIndexes(
		client: SqliteClient,
		tableName: string,
	): Promise<IndexInfoSchemaType[]> {
		if (!(await this.tableExists(client, tableName)))
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });

		// A rowid table's INTEGER PRIMARY KEY is the rowid itself, so it has no index to list.
		const rows = await all<IndexKeyRow>(
			client,
			`SELECT il.name AS indexName, il."unique" AS isUnique, il.origin, il.partial, m.sql,
				xi.seqno, xi.cid, xi.name AS columnName
			 FROM pragma_index_list(?) il
			 JOIN pragma_index_xinfo(il.name) xi ON xi.key = 1
			 LEFT JOIN sqlite_master m ON m.type = 'index' AND m.name = il.name
			 ORDER BY il.origin = 'pk' DESC, il.name, xi.seqno`,
			[tableName],
		);

		const byName = new Map<string, IndexInfoSchemaType>();
		for (const row of rows) {
			const index = byName.get(row.indexName) ?? {
				indexName: row.indexName,
				columns: [],
				isUnique: row.isUnique === 1,
				method: null,
				kind:
					row.origin === "pk" ? "primary" : row.origin === "u" ? "unique-constraint" : "index",
				definition: row.partial === 1 ? row.sql : null,
			};
			byName.set(row.indexName, index);
			if (row.columnName !== null) {
				index.columns.push(row.columnName);
			} else {
				index.columns.push(indexKeyParts(row.sql ?? "")[row.seqno] ?? "");
				index.definition = row.sql;
			}
		}
		return [...byName.values()];
	}

	private async getPrimaryKeyColumns(client: SqliteClient, tableName: string) {
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
		client: SqliteClient,
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
			WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT GLOB '_cf_*'
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

	private async getFkReferencesForTable(
		client: SqliteClient,
		tableName: string,
		{ includeSelf = false }: { includeSelf?: boolean } = {},
	): Promise<ForeignKeyConstraint[]> {
		const fks = await all<{ child: string; from: string; to: string | null }>(
			client,
			`SELECT m.name AS child, f."from", f."to"
			FROM sqlite_master m JOIN pragma_foreign_key_list(m.name) f
			WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT GLOB '_cf_*'
				AND (m.name != ? COLLATE NOCASE OR ?) AND f."table" = ? COLLATE NOCASE`,
			[tableName, includeSelf ? 1 : 0, tableName],
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
		client: SqliteClient,
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
		client: SqliteClient,
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
