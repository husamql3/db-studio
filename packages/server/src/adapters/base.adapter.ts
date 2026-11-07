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
	DatabaseInfoSchemaType,
	DatabaseSchemaType,
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

/**
 * `probe` answered once per client, such as a server's version or a feature it lacks. Keyed
 * by client because tabs can work with two servers at once; a failed probe is forgotten, so
 * the next call asks again.
 */
export const probeOnce = <K extends object, V>(probe: (client: K) => Promise<V>) => {
	const answers = new WeakMap<K, Promise<V>>();

	return (client: K): Promise<V> => {
		let answer = answers.get(client);

		if (!answer) {
			answer = probe(client).catch((e: unknown) => {
				answers.delete(client);
				throw e;
			});
			answers.set(client, answer);
		}

		return answer;
	};
};

export function notImplemented(method: string): never {
	throw new HTTPException(501, {
		message: `${method} is not implemented for this database type`,
	});
}

export abstract class BaseAdapter implements IDbAdapter {
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
		updates: UpdateRecordsSchemaType["updates"],
		keyColumns: string[],
	): RecordUpdateGroup[] {
		const groups = new Map<string, RecordUpdateGroup>();

		for (const update of updates) {
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

	/** Human-readable `col = value` list used in "record not found" errors. */
	protected describeKey(keyColumns: string[], keyValues: unknown[]): string {
		return keyColumns.map((column, i) => `${column} = ${keyValues[i]}`).join(", ");
	}

	protected tableMissing(tableName: string) {
		return new HTTPException(404, { message: `Table "${tableName}" does not exist` });
	}

	protected assertDifferentTableName(tableName: string, newTableName: string): void {
		if (tableName === newTableName) {
			throw new HTTPException(400, {
				message: `New table name must be different from "${tableName}"`,
			});
		}
	}

	abstract getTableData(params: GetTableDataParams): Promise<TableDataResultSchemaType>;

	abstract exportTableData(params: {
		tableName: string;
		schemaName?: string;
		db: DatabaseSchemaType["db"];
	}): Promise<{ cols: string[]; rows: Record<string, unknown>[] }>;

	abstract getDatabasesList(): Promise<DatabaseInfoSchemaType[]>;
	abstract getCurrentDatabase(): Promise<DatabaseSchemaType>;
	abstract getDatabaseConnectionInfo(server: ServerAddress): Promise<ConnectionInfoSchemaType>;
	abstract getTablesList(db: DatabaseSchemaType["db"]): Promise<TableInfoSchemaType[]>;

	abstract getTableSchema(params: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<string>;

	abstract getTableColumns(params: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<ColumnInfoSchemaType[]>;

	abstract addRecord(params: {
		db: DatabaseSchemaType["db"];
		params: AddRecordSchemaType;
	}): Promise<{ insertedCount: number }>;

	abstract bulkInsertRecords(params: BulkInsertRecordsParams): Promise<BulkInsertResult>;

	abstract executeQuery(params: {
		query: string;
		db: DatabaseSchemaType["db"];
	}): Promise<ExecuteQueryResult>;

	// Unreachable defaults: the routes refuse these operations, by the engine's DATABASE_ENGINES
	// traits, for the engines that do not implement them.

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
	addColumn(_params: AddColumnParamsSchemaType): Promise<void> {
		return notImplemented("addColumn");
	}
	deleteColumn(_params: DeleteColumnParamsSchemaType): Promise<void> {
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
		return notImplemented("index operations");
	}
	createIndex(_params: CreateIndexParamsSchemaType): Promise<void> {
		return notImplemented("index operations");
	}
	dropIndex(_params: DropIndexParamsSchemaType): Promise<void> {
		return notImplemented("index operations");
	}
	getServerLogs(_params: { db: DatabaseSchemaType["db"] }): Promise<ServerLogsResult> {
		return notImplemented("getServerLogs");
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
}
