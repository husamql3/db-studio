import type {
	ApiError as ApiErrorBody,
	BaseResponse,
	BulkInsertResult,
	DeleteRecordResult,
} from "@db-studio/shared/types";
import { api } from "./client";

export type AddRecordFormData = Record<string, string>;

/** A record's values as written; NULL is null. */
export type RecordValues = Record<string, string | null>;

export const createRecord = ({
	tableName,
	schemaName,
	data,
	db,
}: {
	tableName: string;
	schemaName?: string;
	data: RecordValues;
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
		useDefault?: boolean;
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
			// JSON drops undefined keys, so a missing or empty key hint is not sent.
			primaryKey: primaryKey || undefined,
			primaryKeys: primaryKeys?.length ? primaryKeys : undefined,
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
	api.delete<BaseResponse<DeleteRecordResult> | ApiErrorBody>(
		force ? "/records/force" : "/records",
		{
			data: { tableName, primaryKeys },
			params: { db: db ?? "", schemaName },
			// Rows that other rows reference answer 409 with `fkViolation` and `relatedRecords`;
			// any other conflict answers 409 with an error body.
			validateStatus: (status) => (status >= 200 && status < 300) || status === 409,
		},
	);
