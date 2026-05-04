import type {
	BaseResponse,
	ConnectionInfoSchemaType,
	CurrentDatabaseSchemaType,
	DatabaseListSchemaType,
} from "@db-studio/shared/types";
import { rootApi } from "./client";

export const getDatabases = () =>
	rootApi.get<BaseResponse<DatabaseListSchemaType>>("/databases");

export const getCurrentDatabase = () =>
	rootApi.get<BaseResponse<CurrentDatabaseSchemaType>>("/databases/current");

export const getDatabaseConnectionInfo = () =>
	rootApi.get<BaseResponse<ConnectionInfoSchemaType>>("/databases/connection");
