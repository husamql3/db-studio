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
	SortDirection,
	TableInfoSchemaType,
	UpdateRecordsSchemaType,
} from "@db-studio/shared/types";
import { mapSqliteToDataType, standardizeSqliteDataTypeLabel } from "@db-studio/shared/types";
import type Database from "better-sqlite3";
import { HTTPException } from "hono/http-exception";
import type { GetTableDataParams } from "@/adapters/adapter.interface.js";
import { BaseAdapter, type NormalizedRow, type QueryBundle } from "@/adapters/base.adapter.js";
import { getSqliteDb } from "@/adapters/connections.js";
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
	to: string;
	on_update: string;
	on_delete: string;
}

export class SqliteAdapter extends BaseAdapter {
	// =========================================================
	// Abstract method implementations
	// =========================================================

	protected async runQuery<T>(_db: string, sql: string, values: unknown[]): Promise<T> {
		const sqliteDb = getSqliteDb();
		const stmt = sqliteDb.prepare(sql);
		// biome-ignore lint/suspicious/noExplicitAny: better-sqlite3 requires spreading unknown[]
		return stmt.all(...(values as any[])) as T;
	}

	protected quoteIdentifier(name: string): string {
		return `"${name}"`;
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

			const sqliteDb = getSqliteDb();

			const colInfoRows = sqliteDb
				.prepare(`PRAGMA table_info("${tableName}")`)
				// biome-ignore lint/suspicious/noExplicitAny: PRAGMA returns untyped rows
				.all() as any[];
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

			const countRow = sqliteDb
				.prepare(`SELECT COUNT(*) as total FROM "${tableName}" ${filterWhere}`)
				// biome-ignore lint/suspicious/noExplicitAny: better-sqlite3 spread
				.get(...(filterValues as any[])) as { total: number } | undefined;
			const total = Number(countRow?.total ?? 0);

			// When falling back to rowid for cursor, include it in SELECT so buildCursors can read it
			const selectClause = useRowid ? "*, rowid" : "*";
			const dataRows = sqliteDb
				.prepare(
					`SELECT ${selectClause} FROM "${tableName}" ${combinedWhere} ${effectiveSortClause} LIMIT ?`,
				)
				// biome-ignore lint/suspicious/noExplicitAny: better-sqlite3 spread
				.all(...([...filterValues, ...cursorValues, limit + 1] as any[])) as Record<
				string,
				unknown
			>[];

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
			const sqliteDb = getSqliteDb();
			const rows = sqliteDb.prepare("PRAGMA database_list").all() as Array<{
				seq: number;
				name: string;
				file: string;
			}>;

			if (!rows.length)
				throw new HTTPException(500, { message: "No databases returned from SQLite" });

			return rows.map((row) => ({
				name: row.name,
				size: this.getFileSize(row.file),
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
			const sqliteDb = getSqliteDb();
			const rows = sqliteDb.prepare("PRAGMA database_list").all() as Array<{ name: string }>;
			const main = rows.find((r) => r.name === "main");
			return { db: main?.name ?? "main" };
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	async getDatabaseConnectionInfo(): Promise<ConnectionInfoSchemaType> {
		try {
			const sqliteDb = getSqliteDb();
			const versionRow = sqliteDb.prepare("SELECT sqlite_version() as version").get() as {
				version: string;
			};

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
			const sqliteDb = getSqliteDb();
			const tables = sqliteDb
				.prepare(
					`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
				)
				.all() as Array<{ name: string }>;

			return tables.map((t) => {
				const countRow = sqliteDb
					.prepare(`SELECT COUNT(*) as count FROM "${t.name}"`)
					.get() as { count: number };
				return { tableName: t.name, rowCount: countRow?.count ?? 0 };
			});
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
		const sqliteDb = getSqliteDb();

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

		sqliteDb
			.prepare(`CREATE TABLE "${tableName}" (${[...columnDefs, ...fkDefs].join(", ")})`)
			.run();

		void db;
	}

	async deleteTable(params: DeleteTableParams): Promise<DeleteTableResult> {
		const { tableName, cascade } = params;
		const sqliteDb = getSqliteDb();

		const tableRow = sqliteDb
			.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
			.get(tableName);
		if (!tableRow)
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });

		const countRow = sqliteDb
			.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`)
			.get() as { count: number };
		const rowCount = countRow?.count ?? 0;

		if (!cascade) {
			const related = this.getFkReferencesForTable(sqliteDb, tableName);
			if (related.length > 0) {
				return {
					deletedCount: 0,
					fkViolation: true,
					relatedRecords: this.getRelatedRecordsForTable(sqliteDb, tableName),
				};
			}
		}

		try {
			sqliteDb.prepare(`DROP TABLE "${tableName}"`).run();
			return { deletedCount: rowCount, fkViolation: false, relatedRecords: [] };
		} catch (error) {
			const errMsg = error instanceof Error ? error.message : String(error);
			if (errMsg.includes("FOREIGN KEY constraint")) {
				return {
					deletedCount: 0,
					fkViolation: true,
					relatedRecords: this.getRelatedRecordsForTable(sqliteDb, tableName),
				};
			}
			if (error instanceof HTTPException) throw error;
			throw new HTTPException(500, { message: `Failed to delete table "${tableName}"` });
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
			const sqliteDb = getSqliteDb();
			const row = sqliteDb
				.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`)
				.get(tableName) as { sql: string } | undefined;
			if (!row) throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });
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
			const sqliteDb = getSqliteDb();

			const tableRow = sqliteDb
				.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
				.get(tableName);
			if (!tableRow)
				throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });

			const columns = sqliteDb
				.prepare(`PRAGMA table_info("${tableName}")`)
				.all() as TableInfoRow[];
			const fks = sqliteDb.prepare(`PRAGMA foreign_key_list("${tableName}")`).all() as FkRow[];

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
		const { tableName, columnName, columnType, defaultValue, isNullable, isUnique, db } =
			params;
		const sqliteDb = getSqliteDb();

		const tableRow = sqliteDb
			.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
			.get(tableName);
		if (!tableRow)
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });

		const colInfo = sqliteDb.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{
			name: string;
		}>;
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
			sqliteDb.prepare(`ALTER TABLE "${tableName}" ADD COLUMN ${def}`).run();
		} catch (e) {
			throw this.wrapError(e);
		}

		void db;
	}

	async deleteColumn(params: DeleteColumnParamsSchemaType): Promise<{ deletedCount: number }> {
		const { tableName, columnName, db } = params;
		const sqliteDb = getSqliteDb();

		const tableRow = sqliteDb
			.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
			.get(tableName);
		if (!tableRow)
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });

		const colInfo = sqliteDb.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{
			name: string;
		}>;
		if (!colInfo.some((c) => c.name === columnName)) {
			throw new HTTPException(404, {
				message: `Column "${columnName}" does not exist in table "${tableName}"`,
			});
		}

		try {
			sqliteDb.prepare(`ALTER TABLE "${tableName}" DROP COLUMN "${columnName}"`).run();
		} catch (e) {
			throw this.wrapError(e);
		}

		void db;
		return { deletedCount: 1 };
	}

	async alterColumn(params: AlterColumnParamsSchemaType): Promise<void> {
		const { tableName, columnName, columnType, isNullable, defaultValue, db } = params;
		const sqliteDb = getSqliteDb();

		const tableRow = sqliteDb
			.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
			.get(tableName);
		if (!tableRow)
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });

		const colInfo = sqliteDb
			.prepare(`PRAGMA table_info("${tableName}")`)
			.all() as TableInfoRow[];
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

			let def = `"${col.name}" ${type}`;
			if (!hasCompositePk && isPk) def += " PRIMARY KEY";
			if (!isPk && !nullable) def += " NOT NULL";
			if (defVal) def += ` DEFAULT ${defVal}`;
			return def;
		});

		if (hasCompositePk) {
			newColDefs.push(`PRIMARY KEY (${pkCols.map((c) => `"${c.name}"`).join(", ")})`);
		}

		const fks = sqliteDb.prepare(`PRAGMA foreign_key_list("${tableName}")`).all() as FkRow[];
		const fksByGroup = new Map<number, FkRow[]>();
		for (const fk of fks) {
			const arr = fksByGroup.get(fk.id) ?? [];
			arr.push(fk);
			fksByGroup.set(fk.id, arr);
		}
		const fkDefs = Array.from(fksByGroup.values()).map((group) => {
			const from = group.map((f) => `"${f.from}"`).join(", ");
			const to = group.map((f) => `"${f.to}"`).join(", ");
			const { table, on_update, on_delete } = group[0];
			return `FOREIGN KEY (${from}) REFERENCES "${table}" (${to}) ON UPDATE ${on_update} ON DELETE ${on_delete}`;
		});

		const colNames = colInfo.map((c) => `"${c.name}"`).join(", ");
		const tempName = `${tableName}_alter_${Date.now()}`;

		const existingIndexes = sqliteDb
			.prepare(
				`SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL`,
			)
			.all(tableName) as Array<{ sql: string }>;
		const existingTriggers = sqliteDb
			.prepare(`SELECT sql FROM sqlite_master WHERE type='trigger' AND tbl_name=?`)
			.all(tableName) as Array<{ sql: string }>;

		sqliteDb.pragma("foreign_keys = OFF");
		const doAlter = sqliteDb.transaction(() => {
			sqliteDb
				.prepare(`CREATE TABLE "${tempName}" (${[...newColDefs, ...fkDefs].join(", ")})`)
				.run();
			sqliteDb
				.prepare(
					`INSERT INTO "${tempName}" (${colNames}) SELECT ${colNames} FROM "${tableName}"`,
				)
				.run();
			sqliteDb.prepare(`DROP TABLE "${tableName}"`).run();
			sqliteDb.prepare(`ALTER TABLE "${tempName}" RENAME TO "${tableName}"`).run();
		});

		try {
			doAlter();
			for (const { sql } of existingIndexes) {
				sqliteDb.prepare(sql).run();
			}
			for (const { sql } of existingTriggers) {
				sqliteDb.prepare(sql).run();
			}
		} catch (e) {
			if (e instanceof HTTPException) throw e;
			throw this.wrapError(e);
		} finally {
			sqliteDb.pragma("foreign_keys = ON");
		}

		void db;
	}

	async renameColumn(params: RenameColumnParamsSchemaType): Promise<void> {
		const { tableName, columnName, newColumnName, db } = params;
		const sqliteDb = getSqliteDb();

		const tableRow = sqliteDb
			.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
			.get(tableName);
		if (!tableRow)
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });

		const colInfo = sqliteDb.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{
			name: string;
		}>;
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
			sqliteDb
				.prepare(
					`ALTER TABLE "${tableName}" RENAME COLUMN "${columnName}" TO "${newColumnName}"`,
				)
				.run();
		} catch (e) {
			throw this.wrapError(e);
		}

		void db;
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
		const sqliteDb = getSqliteDb();
		const columns = Object.keys(data);
		if (!columns.length)
			throw new HTTPException(400, { message: "No data provided for insert" });

		const values = Object.values(data).map((v) =>
			v !== null && typeof v === "object" ? JSON.stringify(v) : v,
		);
		const colNames = columns.map((c) => `"${c}"`).join(", ");
		const placeholders = columns.map(() => "?").join(", ");

		try {
			const result = sqliteDb
				.prepare(`INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders})`)
				.run(...values);
			if (result.changes === 0)
				throw new HTTPException(500, {
					message: `Failed to insert record into "${tableName}"`,
				});
			return { insertedCount: result.changes };
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
		const { tableName, updates, primaryKey } = params;
		const sqliteDb = getSqliteDb();

		const updatesByRow = new Map<unknown, Array<{ columnName: string; value: unknown }>>();
		for (const u of updates) {
			const pkValue = u.rowData[primaryKey];
			if (pkValue === undefined || pkValue === null) {
				throw new HTTPException(400, {
					message: `Primary key "${primaryKey}" not found in row data.`,
				});
			}
			if (!updatesByRow.has(pkValue)) updatesByRow.set(pkValue, []);
			updatesByRow.get(pkValue)?.push({ columnName: u.columnName, value: u.value });
		}

		const doUpdate = sqliteDb.transaction(() => {
			let total = 0;
			for (const [pkValue, rowUpdates] of updatesByRow.entries()) {
				const setClauses = rowUpdates.map((u) => `"${u.columnName}" = ?`).join(", ");
				const values = [
					...rowUpdates.map((u) =>
						u.value !== null && typeof u.value === "object"
							? JSON.stringify(u.value)
							: u.value,
					),
					pkValue,
				];
				// biome-ignore lint/suspicious/noExplicitAny: better-sqlite3 spread
				const result = sqliteDb
					.prepare(`UPDATE "${tableName}" SET ${setClauses} WHERE "${primaryKey}" = ?`)
					.run(...(values as any[]));
				if (result.changes === 0) {
					throw new HTTPException(404, {
						message: `Record with ${primaryKey} = ${pkValue} not found in table "${tableName}"`,
					});
				}
				total += result.changes;
			}
			return total;
		});

		try {
			const total = doUpdate();
			void db;
			return { updatedCount: total };
		} catch (e) {
			if (e instanceof HTTPException) throw e;
			throw this.wrapError(e);
		}
	}

	async deleteRecords({
		tableName,
		primaryKeys,
		db,
	}: DeleteRecordParams): Promise<DeleteRecordResult> {
		const sqliteDb = getSqliteDb();
		const pkColumn = primaryKeys[0]?.columnName;
		if (!pkColumn)
			throw new HTTPException(400, { message: "Primary key column name is required" });

		const pkValues = primaryKeys.map((pk) => pk.value);
		const placeholders = pkValues.map(() => "?").join(", ");

		const doDelete = sqliteDb.transaction(() => {
			// biome-ignore lint/suspicious/noExplicitAny: better-sqlite3 spread
			return sqliteDb
				.prepare(`DELETE FROM "${tableName}" WHERE "${pkColumn}" IN (${placeholders})`)
				.run(...(pkValues as any[])).changes;
		});

		try {
			const changes = doDelete();
			void db;
			return { deletedCount: changes, fkViolation: false, relatedRecords: [] };
		} catch (e) {
			const errMsg = e instanceof Error ? e.message : String(e);
			if (errMsg.includes("FOREIGN KEY constraint failed")) {
				const relatedRecords = this.getRelatedRecords(sqliteDb, tableName, primaryKeys);
				void db;
				return { deletedCount: 0, fkViolation: true, relatedRecords };
			}
			throw this.wrapError(e);
		}
	}

	async forceDeleteRecords({
		tableName,
		primaryKeys,
		db,
	}: DeleteRecordParams): Promise<{ deletedCount: number }> {
		const sqliteDb = getSqliteDb();
		const pkColumn = primaryKeys[0]?.columnName;
		if (!pkColumn)
			throw new HTTPException(400, { message: "Primary key column name is required" });

		const pkValues = primaryKeys.map((pk) => pk.value);

		sqliteDb.pragma("foreign_keys = OFF");
		const doForceDelete = sqliteDb.transaction(() => {
			const fkRefs = this.getFkReferencesForTable(sqliteDb, tableName);
			let totalRelated = 0;

			for (const fk of fkRefs) {
				const ph = pkValues.map(() => "?").join(", ");
				// biome-ignore lint/suspicious/noExplicitAny: better-sqlite3 spread
				const res = sqliteDb
					.prepare(
						`DELETE FROM "${fk.referencingTable}" WHERE "${fk.referencingColumn}" IN (${ph})`,
					)
					.run(...(pkValues as any[]));
				totalRelated += res.changes;
			}

			const ph = pkValues.map(() => "?").join(", ");
			// biome-ignore lint/suspicious/noExplicitAny: better-sqlite3 spread
			const result = sqliteDb
				.prepare(`DELETE FROM "${tableName}" WHERE "${pkColumn}" IN (${ph})`)
				.run(...(pkValues as any[]));
			return result.changes + totalRelated;
		});

		try {
			const deletedCount = doForceDelete();
			void db;
			return { deletedCount };
		} catch (e) {
			if (e instanceof HTTPException) throw e;
			throw this.wrapError(e);
		} finally {
			sqliteDb.pragma("foreign_keys = ON");
		}
	}

	async bulkInsertRecords({
		tableName,
		records,
		db,
	}: BulkInsertRecordsParams): Promise<BulkInsertResult> {
		if (!records?.length)
			throw new HTTPException(400, { message: "At least one record is required" });

		const sqliteDb = getSqliteDb();
		const columns = Object.keys(records[0]);
		const colNames = columns.map((c) => `"${c}"`).join(", ");
		const placeholders = columns.map(() => "?").join(", ");
		const stmt = sqliteDb.prepare(
			`INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders})`,
		);

		const doInsert = sqliteDb.transaction((recs: typeof records) => {
			let count = 0;
			for (const record of recs) {
				const values = columns.map((col) => {
					const v = record[col];
					return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
				});
				// biome-ignore lint/suspicious/noExplicitAny: better-sqlite3 spread
				stmt.run(...(values as any[]));
				count++;
			}
			return count;
		});

		try {
			const successCount = doInsert(records);
			void db;
			return {
				success: true,
				message: `Bulk insert completed: ${successCount} records inserted`,
				successCount,
				failureCount: 0,
			};
		} catch (e) {
			if (e instanceof HTTPException) throw e;
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
		const sqliteDb = getSqliteDb();
		if (!query?.trim()) throw new HTTPException(400, { message: "Query is required" });

		const cleaned = query.trim().replace(/;+$/, "");
		const start = performance.now();

		try {
			const stmt = sqliteDb.prepare(cleaned);
			if (stmt.reader) {
				const rows = stmt.all() as Record<string, unknown>[];
				const duration = performance.now() - start;
				void db;
				return {
					columns: rows.length > 0 ? Object.keys(rows[0]) : [],
					rows,
					rowCount: rows.length,
					duration,
					message: rows.length === 0 ? "OK" : undefined,
				};
			}
			const info = stmt.run();
			const duration = performance.now() - start;
			void db;
			return {
				columns: [],
				rows: [],
				rowCount: info.changes,
				duration,
				message: `OK (${info.changes} rows affected)`,
			};
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	// =========================================================
	// Private helpers
	// =========================================================

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

	private getFkReferencesForTable(
		sqliteDb: Database.Database,
		tableName: string,
	): ForeignKeyConstraint[] {
		const allTables = sqliteDb
			.prepare(
				`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
			)
			.all() as Array<{ name: string }>;

		const references: ForeignKeyConstraint[] = [];
		for (const table of allTables) {
			if (table.name === tableName) continue;
			const fks = sqliteDb
				.prepare(`PRAGMA foreign_key_list("${table.name}")`)
				.all() as FkRow[];
			for (const fk of fks) {
				if (fk.table === tableName) {
					references.push({
						constraintName: `fk_${table.name}_${fk.from}_${tableName}_${fk.to}`,
						referencingTable: table.name,
						referencingColumn: fk.from,
						referencedTable: tableName,
						referencedColumn: fk.to,
					});
				}
			}
		}
		return references;
	}

	private getRelatedRecordsForTable(
		sqliteDb: Database.Database,
		tableName: string,
	): RelatedRecord[] {
		const fks = this.getFkReferencesForTable(sqliteDb, tableName);
		if (!fks.length) return [];

		const results: RelatedRecord[] = [];
		for (const fk of fks) {
			const rows = sqliteDb
				.prepare(`SELECT * FROM "${fk.referencingTable}" LIMIT 100`)
				.all() as Record<string, unknown>[];
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

	private getRelatedRecords(
		sqliteDb: Database.Database,
		tableName: string,
		primaryKeys: DeleteRecordParams["primaryKeys"],
	): RelatedRecord[] {
		const fks = this.getFkReferencesForTable(sqliteDb, tableName);
		if (!fks.length) return [];

		const results: RelatedRecord[] = [];
		for (const fk of fks) {
			const matchingPk = primaryKeys.find((pk) => pk.columnName === fk.referencedColumn);
			if (!matchingPk) continue;
			const pkValues = primaryKeys.map((pk) => pk.value);
			const ph = pkValues.map(() => "?").join(", ");
			// biome-ignore lint/suspicious/noExplicitAny: better-sqlite3 spread
			const rows = sqliteDb
				.prepare(
					`SELECT * FROM "${fk.referencingTable}" WHERE "${fk.referencingColumn}" IN (${ph}) LIMIT 100`,
				)
				.all(...(pkValues as any[])) as Record<string, unknown>[];
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
