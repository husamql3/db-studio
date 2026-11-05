import type {
	AddColumnParamsSchemaType,
	AddRecordSchemaType,
	AlterColumnParamsSchemaType,
	BulkInsertRecordsParams,
	BulkInsertResult,
	CellValue,
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
	IndexInfoSchemaType,
	RenameColumnParamsSchemaType,
	RenameTableParamsSchemaType,
	ServerLogsResult,
	SortDirection,
	TableDataResultSchemaType,
	TableInfoSchemaType,
	UpdateRecordsSchemaType,
} from "@db-studio/shared/types";
import type { GetTableDataParams, IDbAdapter } from "@/adapters/adapter.interface.js";
import type { ServerAddress } from "@/connection-url.js";
import { HTTPException } from "@/http-exception.js";

/**
 * Tables the database estimates at this many rows or more report their estimate instead of an
 * exact count, in the table list and as an unfiltered page total: counting reads the whole table.
 */
export const EXACT_COUNT_LIMIT = 50_000;

/** One record's pending updates, addressed by every one of its key columns. */
export interface RecordUpdateGroup {
	keyValues: unknown[];
	rowUpdates: Array<{ columnName: string; value: unknown; useDefault?: boolean }>;
}

/** Bundles a paginated data query together with its companion COUNT query. */
export interface QueryBundle {
	/** Data query — the final bound parameter must be `limit + 1` for hasMore detection. */
	sql: string;
	values: unknown[];
	/** COUNT query that reflects only the active filters (no cursor). */
	countSql: string;
	countValues: unknown[];
}

/** A single row after adapter-level normalization (column → CellValue). */
export type NormalizedRow = Record<string, CellValue>;

/** The answer to a driver error: its status, and a message to send instead of the driver's. */
export interface DriverErrorClass {
	status: number;
	message?: string;
}

/** For the engines that report a write refused on a read-only session. */
export const READ_ONLY_MESSAGE =
	"This database session is read-only. Disable read-only in Connections if enabled, or connect to a writable database.";

const SOCKET_ERROR_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET"]);

/** The server could not be reached. fetch-based drivers keep the socket error in `cause`. */
const isSocketError = (e: Error): boolean => {
	const code =
		(e as { code?: unknown }).code ?? (e.cause as { code?: unknown } | undefined)?.code;

	return (
		(typeof code === "string" && SOCKET_ERROR_CODES.has(code)) ||
		e.message.includes("ECONNREFUSED") ||
		e.message.includes("connection refused")
	);
};

function notImplemented(method: string): never {
	throw new HTTPException(501, {
		message: `${method} is not implemented for this database type`,
	});
}

function serverLogsNotSupported(): never {
	throw new HTTPException(400, {
		message: "Server logs are not supported for this database type",
	});
}

function indexesNotSupported(): never {
	throw new HTTPException(400, {
		message: "Indexes are not supported for this database type",
	});
}

export abstract class BaseAdapter implements IDbAdapter {
	// =========================================================
	// Abstract — every concrete adapter MUST implement these
	// =========================================================

	/** Execute a parameterised query and return the result rows. */
	protected abstract runQuery<T>(db: string, sql: string, values: unknown[]): Promise<T>;

	/**
	 * Build a paginated data query and a companion COUNT query for getTableData().
	 * The data query must append `limit + 1` as its final bound value so the
	 * template method can detect whether a next page exists.
	 */
	protected abstract buildTableDataQuery(params: GetTableDataParams): QueryBundle;

	/** Map raw DB rows to NormalizedRow records. */
	protected abstract normalizeRows(rawRows: unknown[]): NormalizedRow[];

	/**
	 * Compute next/previous cursors from the final page rows.
	 * Called after rows are trimmed to `limit` and reversed (for desc direction).
	 */
	protected abstract buildCursors(
		params: GetTableDataParams,
		rows: NormalizedRow[],
		hasMore: boolean,
	): { nextCursor: string | null; prevCursor: string | null };

	/** Return the DB-specific quoted form of an identifier (table or column name). */
	protected abstract quoteIdentifier(name: string): string;

	abstract mapToUniversalType(nativeType: string): DataTypes;
	abstract mapFromUniversalType(universalType: string): string;

	// =========================================================
	// Protected helpers — shared across all adapters
	// =========================================================

	/**
	 * Delete requests carry one key column per row, so on a composite key they would match
	 * every row sharing that column's value. Refuse until the request addresses whole keys.
	 */
	protected assertDeletableKey(pkColumns: string[]): void {
		if (pkColumns.length > 1)
			throw new HTTPException(400, {
				message:
					"Deleting rows from tables with a composite primary key is not supported yet.",
			});
	}

	/**
	 * The status and message the API answers a failure with. Adapters recognise their own
	 * driver's errors in `classifyDriverError`; this adds what every driver shares.
	 */
	classifyError(e: unknown): HTTPException {
		if (e instanceof HTTPException) return e;

		if (!(e instanceof Error))
			return new HTTPException(500, { message: "Internal server error", cause: e });

		const { status, message = e.message } = this.classifyDriverError(e) ?? {
			status: isSocketError(e) ? 503 : 500,
		};

		return new HTTPException(status, { message, cause: e });
	}

	/** This engine's driver errors that answer with another status than 500, if `e` is one. */
	protected classifyDriverError(_e: Error): DriverErrorClass | undefined {
		return undefined;
	}

	/**
	 * Resolve the key columns a record update must match on. `primaryKeys` carries
	 * every component of a composite key; `primaryKey` is the single-column form.
	 */
	protected resolveKeyColumns(params: UpdateRecordsSchemaType): string[] {
		return params.primaryKeys?.length ? params.primaryKeys : [params.primaryKey];
	}

	/**
	 * An update matched on part of a primary key would write every row sharing those
	 * values, so the request must name every key column of the table.
	 */
	protected assertWholeKey(pkColumns: string[], keyColumns: string[]): void {
		const missing = pkColumns.filter((column) => !keyColumns.includes(column));

		if (missing.length > 0)
			throw new HTTPException(400, {
				message: `Updates must match on every primary key column; missing: ${missing.join(", ")}`,
			});
	}

	/**
	 * Group updates by the record they target so each row is written once, matched
	 * on every key column. Throws 400 when a key column is absent from the row.
	 */
	protected groupUpdatesByKey(
		params: UpdateRecordsSchemaType,
		keyColumns: string[],
	): RecordUpdateGroup[] {
		const groups = new Map<string, RecordUpdateGroup>();

		for (const update of params.updates) {
			const keyValues = keyColumns.map((column) => {
				const value = update.rowData[column];

				if (value === undefined || value === null) {
					throw new HTTPException(400, {
						message: `Primary key "${column}" not found in row data.`,
					});
				}

				return value;
			});

			const groupKey = JSON.stringify(keyValues.map((value) => String(value)));
			const group: RecordUpdateGroup = groups.get(groupKey) ?? { keyValues, rowUpdates: [] };
			group.rowUpdates.push({
				columnName: update.columnName,
				value: update.value,
				useDefault: update.useDefault,
			});
			groups.set(groupKey, group);
		}

		return [...groups.values()];
	}

	/**
	 * ORDER BY terms for a page: the requested sorts, then every key column not already
	 * sorted on, as tie-breakers in the leading sort's direction so paging stays stable.
	 */
	protected orderTerms<K>(
		sort: GetTableDataParams["sort"] = [],
		order: SortDirection,
		keyColumns: K[],
	): Array<{ column: string | K; direction: SortDirection }> {
		const sorts =
			typeof sort === "string" ? (sort ? [{ columnName: sort, direction: order }] : []) : sort;

		const tieBreakerDirection = sorts[0]?.direction ?? order;

		return [
			...sorts.map((s) => ({ column: s.columnName, direction: s.direction })),
			...keyColumns.flatMap((column) =>
				sorts.some((s) => s.columnName === column)
					? []
					: [{ column, direction: tieBreakerDirection }],
			),
		];
	}

	/** Human-readable `col = value` list used in "record not found" errors. */
	protected describeKey(keyColumns: string[], keyValues: unknown[]): string {
		return keyColumns.map((column, i) => `${column} = ${keyValues[i]}`).join(", ");
	}

	protected assertDifferentTableName(tableName: string, newTableName: string): void {
		if (tableName === newTableName) {
			throw new HTTPException(400, {
				message: `New table name must be different from "${tableName}"`,
			});
		}
	}

	/** Encode cursor data to a URL-safe base64 string. */
	protected encodeCursor(data: CursorData): string {
		return Buffer.from(JSON.stringify(data)).toString("base64url");
	}

	/** Decode a base64url cursor string; returns null if malformed. */
	protected decodeCursor(cursor: string): CursorData | null {
		try {
			return JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
		} catch {
			return null;
		}
	}

	/**
	 * Normalize a single raw row by casting each value to CellValue.
	 * Convenience helper for use inside normalizeRows() implementations.
	 */
	protected normalizeRow(row: Record<string, unknown>): NormalizedRow {
		const out: NormalizedRow = {};

		for (const [k, v] of Object.entries(row)) {
			out[k] = v as CellValue;
		}

		return out;
	}

	// =========================================================
	// Template Methods — shared skeleton, DB-specific steps via abstract methods
	// =========================================================

	async getTableData(params: GetTableDataParams): Promise<TableDataResultSchemaType> {
		const { db, limit = 50, direction = "asc" } = params;
		const bundle = this.buildTableDataQuery(params);

		// The total (active filters, no cursor) and the page (limit+1 rows, to tell whether a
		// next page exists) are independent, so a page costs the slower query, not both.
		const [countRes, pageRows] = await Promise.all([
			this.runQuery<Record<string, unknown>[]>(db, bundle.countSql, bundle.countValues),
			this.runQuery<unknown[]>(db, bundle.sql, bundle.values),
		]);

		const total = Number(countRes[0]?.total ?? 0);

		const hasMore = pageRows.length > limit;
		const rawRows = hasMore ? pageRows.slice(0, limit) : pageRows;

		let rows = this.normalizeRows(rawRows);

		if (direction === "desc") rows = rows.reverse();

		const { nextCursor, prevCursor } = this.buildCursors(params, rows, hasMore);

		return {
			data: rows,
			meta: {
				limit,
				total,
				hasNextPage: direction === "asc" ? hasMore : !!params.cursor,
				hasPreviousPage: direction === "asc" ? !!params.cursor : hasMore,
				nextCursor,
				prevCursor,
			},
		};
	}

	async exportTableData({
		tableName,
		db,
	}: {
		tableName: string;
		schemaName?: string;
		db: DatabaseSchemaType["db"];
	}): Promise<{ cols: string[]; rows: Record<string, unknown>[] }> {
		const sql = `SELECT * FROM ${this.quoteIdentifier(tableName)}`;
		const rows = await this.runQuery<Record<string, unknown>[]>(db, sql, []);

		if (!rows || rows.length === 0) {
			throw new HTTPException(404, {
				message: `Table "${tableName}" does not exist or has no data`,
			});
		}

		const cols = Object.keys(rows[0]);

		return { cols, rows };
	}

	// =========================================================
	// Default stubs — override in concrete adapters
	// =========================================================

	getDatabasesList(): Promise<DatabaseInfoSchemaType[]> {
		return notImplemented("getDatabasesList");
	}
	getCurrentDatabase(): Promise<DatabaseSchemaType> {
		return notImplemented("getCurrentDatabase");
	}
	getDatabaseConnectionInfo(_server: ServerAddress): Promise<ConnectionInfoSchemaType> {
		return notImplemented("getDatabaseConnectionInfo");
	}
	getTablesList(_db: DatabaseSchemaType["db"]): Promise<TableInfoSchemaType[]> {
		return notImplemented("getTablesList");
	}
	createTable(_params: {
		tableData: CreateTableSchemaType;
		db: DatabaseSchemaType["db"];
	}): Promise<void> {
		return notImplemented("createTable");
	}
	deleteTable(_params: DeleteTableParams): Promise<DeleteTableResult> {
		return notImplemented("deleteTable");
	}
	renameTable(_params: RenameTableParamsSchemaType): Promise<void> {
		return notImplemented("renameTable");
	}
	getTableSchema(_params: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<string> {
		return notImplemented("getTableSchema");
	}
	getTableColumns(_params: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<ColumnInfoSchemaType[]> {
		return notImplemented("getTableColumns");
	}
	addColumn(_params: AddColumnParamsSchemaType): Promise<void> {
		return notImplemented("addColumn");
	}
	deleteColumn(_params: DeleteColumnParamsSchemaType): Promise<{ deletedCount: number }> {
		return notImplemented("deleteColumn");
	}
	alterColumn(_params: AlterColumnParamsSchemaType): Promise<void> {
		return notImplemented("alterColumn");
	}
	renameColumn(_params: RenameColumnParamsSchemaType): Promise<void> {
		return notImplemented("renameColumn");
	}
	getTableIndexes(_params: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<IndexInfoSchemaType[]> {
		return indexesNotSupported();
	}
	createIndex(_params: CreateIndexParamsSchemaType): Promise<void> {
		return indexesNotSupported();
	}
	dropIndex(_params: DropIndexParamsSchemaType): Promise<void> {
		return indexesNotSupported();
	}
	getServerLogs(_params: { db: DatabaseSchemaType["db"] }): Promise<ServerLogsResult> {
		return serverLogsNotSupported();
	}
	addRecord(_params: {
		db: DatabaseSchemaType["db"];
		params: AddRecordSchemaType;
	}): Promise<{ insertedCount: number }> {
		return notImplemented("addRecord");
	}
	updateRecords(_params: {
		db: DatabaseSchemaType["db"];
		params: UpdateRecordsSchemaType;
	}): Promise<{ updatedCount: number }> {
		return notImplemented("updateRecords");
	}
	deleteRecords(_params: DeleteRecordParams): Promise<DeleteRecordResult> {
		return notImplemented("deleteRecords");
	}
	forceDeleteRecords(_params: DeleteRecordParams): Promise<{ deletedCount: number }> {
		return notImplemented("forceDeleteRecords");
	}
	bulkInsertRecords(_params: BulkInsertRecordsParams): Promise<BulkInsertResult> {
		return notImplemented("bulkInsertRecords");
	}
	executeQuery(_params: {
		query: string;
		db: DatabaseSchemaType["db"];
	}): Promise<ExecuteQueryResult> {
		return notImplemented("executeQuery");
	}
}
