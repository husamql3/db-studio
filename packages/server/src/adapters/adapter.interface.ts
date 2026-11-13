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
	DatabaseInfoSchemaType,
	DatabaseSchemaType,
	DeleteColumnParamsSchemaType,
	DeleteRecordParams,
	DeleteRecordResult,
	DeleteTableParams,
	DeleteTableResult,
	DropIndexParamsSchemaType,
	ExecuteQueryResult,
	FilterType,
	IndexInfoSchemaType,
	RenameColumnParamsSchemaType,
	RenameTableParamsSchemaType,
	RoutineInfoSchemaType,
	ServerLogsResult,
	SortDirection,
	SortType,
	TableDataResultSchemaType,
	TableInfoSchemaType,
	UpdateRecordsSchemaType,
} from "@db-studio/shared/types";
import type { ServerAddress } from "@/connection-url.js";
import type { HTTPException } from "@/http-exception.js";

export interface GetTableDataParams {
	tableName: string;
	schemaName?: string;
	db: DatabaseSchemaType["db"];
	cursor?: string;
	limit?: number;
	direction?: SortDirection;
	sort?: SortType[];
	/** The key's direction when nothing is sorted. */
	order?: SortDirection;
	filters?: FilterType[];
}

export interface IDbAdapter {
	getDatabasesList(): Promise<DatabaseInfoSchemaType[]>;
	getCurrentDatabase(): Promise<DatabaseSchemaType>;
	/** `server` is where the URL points, for engines whose server does not report it. */
	getDatabaseConnectionInfo(server: ServerAddress): Promise<ConnectionInfoSchemaType>;

	getTablesList(db: DatabaseSchemaType["db"]): Promise<TableInfoSchemaType[]>;
	createTable(params: {
		tableData: CreateTableSchemaType;
		db: DatabaseSchemaType["db"];
	}): Promise<void>;
	deleteTable(params: DeleteTableParams): Promise<DeleteTableResult>;
	renameTable(params: RenameTableParamsSchemaType): Promise<void>;
	getTableSchema(params: {
		tableName: string;
		schemaName?: string;
		db: DatabaseSchemaType["db"];
	}): Promise<string>;

	getTableColumns(params: {
		tableName: string;
		db: DatabaseSchemaType["db"];
		schemaName?: string;
	}): Promise<ColumnInfoSchemaType[]>;
	addColumn(params: AddColumnParamsSchemaType): Promise<void>;
	deleteColumn(params: DeleteColumnParamsSchemaType): Promise<void>;
	alterColumn(params: AlterColumnParamsSchemaType): Promise<void>;
	renameColumn(params: RenameColumnParamsSchemaType): Promise<void>;

	getTableIndexes(params: {
		tableName: string;
		schemaName?: string;
		db: DatabaseSchemaType["db"];
	}): Promise<IndexInfoSchemaType[]>;
	createIndex(params: CreateIndexParamsSchemaType): Promise<void>;
	dropIndex(params: DropIndexParamsSchemaType): Promise<void>;

	getTableData(params: GetTableDataParams): Promise<TableDataResultSchemaType>;
	addRecord(params: {
		db: DatabaseSchemaType["db"];
		schemaName?: string;
		params: AddRecordSchemaType;
	}): Promise<{ insertedCount: number }>;
	updateRecords(params: {
		db: DatabaseSchemaType["db"];
		schemaName?: string;
		params: UpdateRecordsSchemaType;
	}): Promise<{ updatedCount: number }>;
	deleteRecords(params: DeleteRecordParams): Promise<DeleteRecordResult>;
	forceDeleteRecords(params: DeleteRecordParams): Promise<{ deletedCount: number }>;
	bulkInsertRecords(params: BulkInsertRecordsParams): Promise<BulkInsertResult>;
	exportTableData(params: {
		tableName: string;
		schemaName?: string;
		db: DatabaseSchemaType["db"];
	}): Promise<{ cols: string[]; rows: Record<string, unknown>[] }>;

	executeQuery(params: {
		query: string;
		db: DatabaseSchemaType["db"];
	}): Promise<ExecuteQueryResult>;

	/** The newest entries of the server's own log, or why the server keeps it out of reach. */
	getServerLogs(params: { db: DatabaseSchemaType["db"] }): Promise<ServerLogsResult>;
	getRoutines(params: { db: DatabaseSchemaType["db"] }): Promise<RoutineInfoSchemaType[]>;

	/** The status and message the API answers a failure of this engine's request with. */
	classifyError(e: unknown): HTTPException;
}
