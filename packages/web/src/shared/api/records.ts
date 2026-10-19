import type {
	BaseResponse,
	BulkInsertResult,
	DeleteRecordResult,
} from "@db-studio/shared/types";
import { api } from "./client";

export type AddRecordFormData = Record<string, string>;

export const createRecord = ({
	tableName,
	schemaName,
	data,
	db,
}: {
	tableName: string;
	schemaName?: string;
	data: AddRecordFormData;
	db?: string | null;
}) =>
	api.post<BaseResponse<string>>(
		"/records",
		{ tableName, data },
		{ params: { db: db ?? "", schemaName } },
	);

export const updateRecords = ({
	tableName,
	schemaName,
	updates,
	primaryKey,
	primaryKeys,
	db,
}: {
	tableName: string;
	schemaName?: string;
	updates: Array<{
		rowData: Record<string, unknown>;
		columnName: string;
		value: unknown;
	}>;
	primaryKey?: string;
	primaryKeys?: string[];
	db?: string | null;
}) =>
	api.patch<BaseResponse<string>>(
		"/records",
		{
			tableName,
			updates,
			...(primaryKey ? { primaryKey } : {}),
			...(primaryKeys?.length ? { primaryKeys } : {}),
		},
		{ params: { db: db ?? "", schemaName } },
	);

export const bulkInsertRecords = ({
	tableName,
	schemaName,
	records,
	db,
}: {
	tableName: string;
	schemaName?: string;
	records: Record<string, unknown>[];
	db?: string | null;
}) =>
	api.post<BaseResponse<BulkInsertResult>>(
		"/records/bulk",
		{ tableName, records },
		{ params: { db: db ?? "", schemaName } },
	);

export const deleteRecords = ({
	tableName,
	schemaName,
	primaryKeys,
	force,
	db,
}: {
	tableName: string;
	schemaName?: string;
	primaryKeys: Array<{ columnName: string; value: unknown }>;
	force?: boolean;
	db?: string | null;
}) =>
	api.delete<BaseResponse<DeleteRecordResult>>(force ? "/records/force" : "/records", {
		data: { tableName, primaryKeys },
		params: { db: db ?? "", schemaName },
	});
