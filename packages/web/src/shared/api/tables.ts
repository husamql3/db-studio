import type {
	AddColumnSchemaType,
	AlterColumnSchemaType,
	BaseResponse,
	ColumnInfoSchemaType,
	CreateIndexSchemaType,
	CreateTableSchemaType,
	DeleteColumnParamsSchemaType,
	DeleteTableResult,
	FormatType,
	IndexInfoSchemaType,
	RenameColumnSchemaType,
	RenameTableSchemaType,
	TableDataResultSchemaType,
	TableInfoSchemaType,
	TableSchemaResult,
} from "@db-studio/shared/types";
import { api } from "./client";

export type TableDataParams = {
	tableName: string;
	schemaName?: string;
	db?: string;
	limit?: string;
	cursor?: string | null;
	direction?: string | null;
	sort?: string;
	order?: string | null;
	filters?: string;
};

export const getTables = (db?: string | null) =>
	api.get<BaseResponse<TableInfoSchemaType[]>>("/tables", {
		params: { db: db ?? "" },
	});

export type SchemaGraphTable = TableInfoSchemaType & { columns: ColumnInfoSchemaType[] };

export const getSchemaGraph = (db?: string | null) =>
	api.get<BaseResponse<SchemaGraphTable[]>>("/tables/graph", {
		params: { db: db ?? "" },
	});

export const getTableColumns = (tableName: string, db?: string | null, schemaName?: string) =>
	api.get<BaseResponse<ColumnInfoSchemaType[]>>(
		`/tables/${encodeURIComponent(tableName)}/columns`,
		{ params: { db: db ?? "", schemaName } },
	);

export const getTableData = ({
	tableName,
	schemaName,
	db,
	limit,
	cursor,
	direction,
	sort,
	order,
	filters,
}: TableDataParams) =>
	api.get<BaseResponse<TableDataResultSchemaType>>(
		`/tables/${encodeURIComponent(tableName)}/data`,
		{
			params: {
				db,
				schemaName,
				limit,
				cursor: cursor ?? undefined,
				direction: direction ?? undefined,
				sort,
				order: order ?? undefined,
				filters,
			},
		},
	);

export const createTable = (data: CreateTableSchemaType, db?: string | null) =>
	api.post<BaseResponse<string>>("/tables", data, { params: { db: db ?? "" } });

export const deleteTable = ({
	tableName,
	schemaName,
	db,
	cascade = false,
}: {
	tableName: string;
	schemaName?: string;
	db?: string | null;
	cascade?: boolean;
}) =>
	api.delete<BaseResponse<DeleteTableResult>>(`/tables/${encodeURIComponent(tableName)}`, {
		params: { db: db ?? "", schemaName, cascade: cascade ? "true" : "false" },
	});

export const renameTable = ({
	tableName,
	data,
	db,
}: {
	tableName: string;
	data: RenameTableSchemaType;
	db?: string | null;
}) =>
	api.patch<BaseResponse<string>>(`/tables/${encodeURIComponent(tableName)}/rename`, data, {
		params: { db: db ?? "" },
	});

export const addColumn = ({
	tableName,
	schemaName,
	data,
	db,
}: {
	tableName: string;
	schemaName?: string;
	data: AddColumnSchemaType;
	db?: string | null;
}) =>
	api.post<BaseResponse<string>>(`/tables/${encodeURIComponent(tableName)}/columns`, data, {
		params: { db: db ?? "", schemaName },
	});

export const alterColumn = ({
	tableName,
	schemaName,
	columnName,
	data,
	db,
}: {
	tableName: string;
	schemaName?: string;
	columnName: string;
	data: AlterColumnSchemaType;
	db?: string | null;
}) =>
	api.patch<BaseResponse<string>>(
		`/tables/${encodeURIComponent(tableName)}/columns/${encodeURIComponent(columnName)}`,
		data,
		{ params: { db: db ?? "", schemaName } },
	);

export const renameColumn = ({
	tableName,
	schemaName,
	columnName,
	data,
	db,
}: {
	tableName: string;
	schemaName?: string;
	columnName: string;
	data: RenameColumnSchemaType;
	db?: string | null;
}) =>
	api.patch<BaseResponse<string>>(
		`/tables/${encodeURIComponent(tableName)}/columns/${encodeURIComponent(columnName)}/rename`,
		data,
		{ params: { db: db ?? "", schemaName } },
	);

export const deleteColumn = ({
	tableName,
	schemaName,
	columnName,
	cascade,
	db,
}: DeleteColumnParamsSchemaType & { db?: string | null }) =>
	api.delete<BaseResponse<string>>(
		`/tables/${encodeURIComponent(tableName)}/columns/${encodeURIComponent(columnName)}`,
		{ params: { db: db ?? "", schemaName, cascade: cascade ? "true" : "false" } },
	);

export const getTableIndexes = (tableName: string, db?: string | null, schemaName?: string) =>
	api.get<BaseResponse<IndexInfoSchemaType[]>>(
		`/tables/${encodeURIComponent(tableName)}/indexes`,
		{ params: { db: db ?? "", schemaName } },
	);

export const createIndex = ({
	tableName,
	schemaName,
	data,
	db,
}: {
	tableName: string;
	schemaName?: string;
	data: CreateIndexSchemaType;
	db?: string | null;
}) =>
	api.post<BaseResponse<string>>(`/tables/${encodeURIComponent(tableName)}/indexes`, data, {
		params: { db: db ?? "", schemaName },
	});

export const dropIndex = ({
	tableName,
	schemaName,
	indexName,
	db,
}: {
	tableName: string;
	schemaName?: string;
	indexName: string;
	db?: string | null;
}) =>
	api.delete<BaseResponse<string>>(
		`/tables/${encodeURIComponent(tableName)}/indexes/${encodeURIComponent(indexName)}`,
		{ params: { db: db ?? "", schemaName } },
	);

export const getTableSchema = (tableName: string, db?: string | null, schemaName?: string) =>
	api.get<BaseResponse<TableSchemaResult>>(`/tables/${encodeURIComponent(tableName)}/schema`, {
		params: { db: db ?? "", schemaName },
	});

export const exportTable = ({
	tableName,
	schemaName,
	format,
	db,
}: {
	tableName: string;
	schemaName?: string;
	format: FormatType;
	db?: string | null;
}) =>
	api.get(`/tables/${encodeURIComponent(tableName)}/export`, {
		params: { db: db ?? "", schemaName, format },
		responseType: "blob",
	});
