import type { BaseResponse, BulkInsertResult, DeleteRecordResult } from "shared/types";
import { api } from "./client";

export type AddRecordFormData = Record<string, string>;

export const createRecord = ({
	tableName,
	data,
	db,
}: {
	tableName: string;
	data: AddRecordFormData;
	db?: string | null;
}) =>
	api.post<BaseResponse<string>>(
		"/records",
		{ tableName, data },
		{ params: { db: db ?? "" } },
	);

export const updateRecords = ({
	tableName,
	updates,
	db,
}: {
	tableName: string;
	updates: Array<{
		rowData: Record<string, unknown>;
		columnName: string;
		value: unknown;
	}>;
	db?: string | null;
}) =>
	api.patch<BaseResponse<string>>(
		"/records",
		{ tableName, updates },
		{ params: { db: db ?? "" } },
	);

export const bulkInsertRecords = ({
	tableName,
	records,
	db,
}: {
	tableName: string;
	records: Record<string, unknown>[];
	db?: string | null;
}) =>
	api.post<BaseResponse<BulkInsertResult>>(
		"/records/bulk",
		{ tableName, records },
		{ params: { db: db ?? "" } },
	);

export const deleteRecords = ({
	tableName,
	primaryKeys,
	force,
	db,
}: {
	tableName: string;
	primaryKeys: Array<{ columnName: string; value: unknown }>;
	force?: boolean;
	db?: string | null;
}) =>
	api.delete<BaseResponse<DeleteRecordResult>>(force ? "/records/force" : "/records", {
		data: { tableName, primaryKeys },
		params: { db: db ?? "" },
	});
