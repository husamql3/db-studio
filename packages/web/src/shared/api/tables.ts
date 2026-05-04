import type {
	AddColumnSchemaType,
	AlterColumnSchemaType,
	BaseResponse,
	ColumnInfoSchemaType,
	CreateTableSchemaType,
	DeleteColumnParamsSchemaType,
	DeleteTableResult,
	FormatType,
	RenameColumnSchemaType,
	TableDataResultSchemaType,
	TableInfoSchemaType,
	TableSchemaResult,
} from "shared/types";
import { api } from "./client";

export type TableDataParams = {
	tableName: string;
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

export const getTableColumns = (tableName: string, db?: string | null) =>
	api.get<BaseResponse<ColumnInfoSchemaType[]>>(
		`/tables/${encodeURIComponent(tableName)}/columns`,
		{ params: { db: db ?? "" } },
	);

export const getTableData = ({
	tableName,
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
	db,
	cascade = false,
}: {
	tableName: string;
	db?: string | null;
	cascade?: boolean;
}) =>
	api.delete<BaseResponse<DeleteTableResult>>(`/tables/${encodeURIComponent(tableName)}`, {
		params: { db: db ?? "", cascade: cascade ? "true" : "false" },
	});

export const addColumn = ({
	tableName,
	data,
	db,
}: {
	tableName: string;
	data: AddColumnSchemaType;
	db?: string | null;
}) =>
	api.post<BaseResponse<string>>(`/tables/${encodeURIComponent(tableName)}/columns`, data, {
		params: { db: db ?? "" },
	});

export const alterColumn = ({
	tableName,
	columnName,
	data,
	db,
}: {
	tableName: string;
	columnName: string;
	data: AlterColumnSchemaType;
	db?: string | null;
}) =>
	api.patch<BaseResponse<string>>(
		`/tables/${encodeURIComponent(tableName)}/columns/${encodeURIComponent(columnName)}`,
		data,
		{ params: { db: db ?? "" } },
	);

export const renameColumn = ({
	tableName,
	columnName,
	data,
	db,
}: {
	tableName: string;
	columnName: string;
	data: RenameColumnSchemaType;
	db?: string | null;
}) =>
	api.patch<BaseResponse<string>>(
		`/tables/${encodeURIComponent(tableName)}/columns/${encodeURIComponent(columnName)}/rename`,
		data,
		{ params: { db: db ?? "" } },
	);

export const deleteColumn = ({
	tableName,
	columnName,
	cascade,
	db,
}: DeleteColumnParamsSchemaType & { db?: string | null }) =>
	api.delete<BaseResponse<string>>(
		`/tables/${encodeURIComponent(tableName)}/columns/${encodeURIComponent(columnName)}`,
		{ params: { db: db ?? "", cascade: cascade ? "true" : "false" } },
	);

export const getTableSchema = (tableName: string, db?: string | null) =>
	api.get<BaseResponse<TableSchemaResult>>(`/tables/${encodeURIComponent(tableName)}/schema`, {
		params: { db: db ?? "" },
	});

export const exportTable = ({
	tableName,
	format,
	db,
}: {
	tableName: string;
	format: FormatType;
	db?: string | null;
}) =>
	api.get(`/tables/${encodeURIComponent(tableName)}/export`, {
		params: { db: db ?? "", format },
		responseType: "blob",
	});
