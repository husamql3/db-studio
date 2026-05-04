import type {
	AddColumnParamsSchemaType,
	AddRecordSchemaType,
	AlterColumnParamsSchemaType,
	BulkInsertRecordsParams,
	BulkInsertResult,
	CellValue,
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
	RenameColumnParamsSchemaType,
	TableDataResultSchemaType,
	TableInfoSchemaType,
	UpdateRecordsSchemaType,
} from "@db-studio/shared/types";
import { HTTPException } from "hono/http-exception";
import { DatabaseError } from "pg";
import type { GetTableDataParams, IDbAdapter } from "@/adapters/adapter.interface.js";

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

function notImplemented(method: string): never {
	throw new HTTPException(501, {
		message: `${method} is not implemented for this database type`,
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
	 * Wrap any thrown value in an HTTPException.
	 * Detects connection errors for all supported databases and maps them to 503.
	 * Concrete adapters can override to handle additional DB-specific error codes.
	 */
	protected wrapError(e: unknown): HTTPException {
		if (e instanceof HTTPException) return e;

		if (e instanceof Error) {
			const err = e as { code?: string; errno?: number };

			const isConnectionError =
				err.code === "ECONNREFUSED" ||
				err.code === "ENOTFOUND" ||
				err.code === "ETIMEDOUT" ||
				err.code === "ER_ACCESS_DENIED_ERROR" ||
				err.code === "ER_BAD_HOST_ERROR" ||
				err.code === "ECONNRESET" ||
				err.errno === 1045 || // MySQL ER_ACCESS_DENIED_ERROR
				err.errno === 2003 || // MySQL can't connect to server
				err.errno === 2002 || // MySQL can't connect to local server
				e.message.includes("ECONNREFUSED") ||
				e.message.includes("connection refused") ||
				e.message.includes("timeout expired") ||
				e.message.includes("Connection terminated") ||
				e.message.includes("MongoNetworkError") ||
				e.message.includes("MongoServerSelectionError") ||
				e.message.includes("Login failed") ||
				(e instanceof DatabaseError && e.code?.startsWith("08")); // PG connection exception class

			if (isConnectionError) {
				return new HTTPException(503, { message: e.message });
			}

			return new HTTPException(500, { message: e.message });
		}

		return new HTTPException(500, { message: "Internal server error" });
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
		try {
			const { db, limit = 50, direction = "asc" } = params;
			const bundle = this.buildTableDataQuery(params);

			// Total count with active filters only (no cursor)
			const countRes = await this.runQuery<Record<string, unknown>[]>(
				db,
				bundle.countSql,
				bundle.countValues,
			);
			const total = Number(countRes[0]?.total ?? 0);

			// Fetch limit+1 rows to determine whether a next page exists
			let rawRows = await this.runQuery<unknown[]>(db, bundle.sql, bundle.values);
			const hasMore = rawRows.length > limit;
			if (hasMore) rawRows = rawRows.slice(0, limit);

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
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	async exportTableData({
		tableName,
		db,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<{ cols: string[]; rows: Record<string, CellValue>[] }> {
		try {
			const sql = `SELECT * FROM ${this.quoteIdentifier(tableName)}`;
			const rows = await this.runQuery<Record<string, CellValue>[]>(db, sql, []);

			if (!rows || rows.length === 0) {
				throw new HTTPException(404, {
					message: `Table "${tableName}" does not exist or has no data`,
				});
			}

			const cols = Object.keys(rows[0]);
			return { cols, rows };
		} catch (e) {
			throw this.wrapError(e);
		}
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
	getDatabaseConnectionInfo(): Promise<ConnectionInfoSchemaType> {
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
