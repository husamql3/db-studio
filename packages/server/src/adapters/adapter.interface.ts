import type {
	AddColumnParamsSchemaType,
	AddRecordSchemaType,
	AlterColumnParamsSchemaType,
	BulkInsertRecordsParams,
	BulkInsertResult,
	CellValue,
	ConnectionInfoSchemaType,
	CreateTableSchemaType,
	DataTypes,
	DatabaseInfoSchemaType,
	DatabaseSchemaType,
	DeleteColumnParamsSchemaType,
	DeleteRecordParams,
	DeleteRecordResult,
	DeleteTableParams,
	DeleteTableResult,
	ExecuteQueryResult,
	FilterType,
	RenameColumnParamsSchemaType,
	SortDirection,
	SortType,
	TableDataResultSchemaType,
	TableInfoSchemaType,
	UpdateRecordsSchemaType,
	ColumnInfoSchemaType,
} from "shared/types";

export interface GetTableDataParams {
	tableName: string;
	db: DatabaseSchemaType["db"];
	cursor?: string;
	limit?: number;
	direction?: SortDirection;
	sort?: string | SortType[];
	order?: SortDirection;
	filters?: FilterType[];
}

export interface IDbAdapter {
	// --- Databases ---

	getDatabasesList(): Promise<DatabaseInfoSchemaType[]>;

	getCurrentDatabase(): Promise<DatabaseSchemaType>;

	getDatabaseConnectionInfo(): Promise<ConnectionInfoSchemaType>;

	// --- Tables ---

	getTablesList(db: DatabaseSchemaType["db"]): Promise<TableInfoSchemaType[]>;

	createTable(params: {
		tableData: CreateTableSchemaType;
		db: DatabaseSchemaType["db"];
	}): Promise<void>;

	deleteTable(params: DeleteTableParams): Promise<DeleteTableResult>;

	getTableSchema(params: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<string>;

	// --- Columns ---

	getTableColumns(params: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<ColumnInfoSchemaType[]>;

	addColumn(params: AddColumnParamsSchemaType): Promise<void>;

	deleteColumn(params: DeleteColumnParamsSchemaType): Promise<{ deletedCount: number }>;

	alterColumn(params: AlterColumnParamsSchemaType): Promise<void>;

	renameColumn(params: RenameColumnParamsSchemaType): Promise<void>;

	// --- Records ---

	getTableData(params: GetTableDataParams): Promise<TableDataResultSchemaType>;

	addRecord(params: {
		db: DatabaseSchemaType["db"];
		params: AddRecordSchemaType;
	}): Promise<{ insertedCount: number }>;

	updateRecords(params: {
		db: DatabaseSchemaType["db"];
		params: UpdateRecordsSchemaType;
	}): Promise<{ updatedCount: number }>;

	deleteRecords(params: DeleteRecordParams): Promise<DeleteRecordResult>;

	forceDeleteRecords(params: DeleteRecordParams): Promise<{ deletedCount: number }>;

	bulkInsertRecords(params: BulkInsertRecordsParams): Promise<BulkInsertResult>;

	exportTableData(params: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<{ cols: string[]; rows: Record<string, CellValue>[] }>;

	// --- Query ---

	executeQuery(params: {
		query: string;
		db: DatabaseSchemaType["db"];
	}): Promise<ExecuteQueryResult>;

	// --- Type system ---

	/**
	 * Maps a DB-native column type string to the universal DataTypes variant
	 * used for frontend cell rendering (e.g. "int4" → "number").
	 */
	mapToUniversalType(nativeType: string): DataTypes;

	/**
	 * Maps a universal column type string back to the DB-native type string
	 * used when creating or altering columns (e.g. "number" → "INTEGER").
	 */
	mapFromUniversalType(universalType: string): string;
}
