import type {
	BaseResponse,
	CreateKeySchemaType,
	DeleteKeyResultSchemaType,
	KeyActionSchemaType,
	KeyDetailsResultSchemaType,
	KeyRawResultSchemaType,
	KeyScanResultSchemaType,
	KeyWriteResultSchemaType,
	RedisKeyTypeSchemaType,
} from "@db-studio/shared/types";
import { api } from "./client";

export interface ScanRedisKeysParams {
	db: string;
	cursor?: string;
	limit?: number;
	search?: string;
	exactPattern?: boolean;
	type?: Exclude<RedisKeyTypeSchemaType, "unknown">;
}

export const scanRedisKeys = (params: ScanRedisKeysParams) =>
	api.get<BaseResponse<KeyScanResultSchemaType>>("/keys", { params });

export const getRedisKey = ({
	db,
	key,
	cursor,
	limit = 100,
	full = false,
	direction = "forward",
}: {
	db: string;
	key: string;
	cursor?: string;
	limit?: number;
	full?: boolean;
	direction?: "forward" | "backward";
}) =>
	api.get<BaseResponse<KeyDetailsResultSchemaType>>(`/keys/${key}`, {
		params: { db, cursor, limit, full, direction },
	});

export const getRedisStringChunk = ({
	db,
	key,
	offset,
	expectedRevision,
}: {
	db: string;
	key: string;
	offset: number;
	expectedRevision: string;
}) =>
	api.get<BaseResponse<KeyRawResultSchemaType>>(`/keys/${key}/raw`, {
		params: { db, offset, limit: 1024 * 1024, expectedRevision },
	});

export const createRedisKey = ({ db, data }: { db: string; data: CreateKeySchemaType }) =>
	api.post<BaseResponse<KeyWriteResultSchemaType>>("/keys", data, { params: { db } });

export const applyRedisKeyAction = ({
	db,
	key,
	data,
}: {
	db: string;
	key: string;
	data: KeyActionSchemaType;
}) =>
	api.post<BaseResponse<KeyWriteResultSchemaType>>(`/keys/${key}/actions`, data, {
		params: { db },
	});

export const deleteRedisKey = ({
	db,
	key,
	expectedRevision,
	force = false,
}: {
	db: string;
	key: string;
	expectedRevision: string;
	force?: boolean;
}) =>
	api.delete<BaseResponse<DeleteKeyResultSchemaType>>(`/keys/${key}`, {
		params: { db, expectedRevision, force },
	});
