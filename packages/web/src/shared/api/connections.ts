import type {
	BaseResponse,
	ConnectionSummarySchemaType,
	ConnectionsStateSchemaType,
	UpdateConnectionSchemaType,
} from "@db-studio/shared/types";
import { rootApi } from "./client";

export const getConnections = () =>
	rootApi.get<BaseResponse<ConnectionsStateSchemaType>>("/connections");

export const connectUrl = (url: string) =>
	rootApi.post<BaseResponse<ConnectionsStateSchemaType>>("/connections", { url });

export const connectSavedConnection = (id: string) =>
	rootApi.post<BaseResponse<ConnectionsStateSchemaType>>(
		`/connections/${encodeURIComponent(id)}/connect`,
	);

export const updateConnection = (id: string, data: UpdateConnectionSchemaType) =>
	rootApi.patch<BaseResponse<ConnectionSummarySchemaType>>(
		`/connections/${encodeURIComponent(id)}`,
		data,
	);

export const deleteConnection = (id: string) =>
	rootApi.delete<BaseResponse<string>>(`/connections/${encodeURIComponent(id)}`);
