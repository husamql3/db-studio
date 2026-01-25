import type { TypedResponse } from "hono";
import type { ApiError, BaseResponse } from "shared/types";
import type { DatabaseTypeSchema } from "shared/types/database.types.js";
import type { ChatRoutes } from "@/routes/chat.routes.js";
import type { DatabasesRoutes } from "@/routes/databases.routes.js";
import type { QueryRoutes } from "@/routes/query.routes.js";
import type { RecordsRoutes } from "@/routes/records.routes.js";
import type { TablesRoutes } from "@/routes/tables.routes.js";

export type BaseResponseType<T> = TypedResponse<BaseResponse<T>, 200>;

export type ApiErrorType = TypedResponse<ApiError, 500>;

/**
 * ApiHandler is a type that represents a response or error from an API endpoint.
 */
export type ApiHandler<T> = Promise<BaseResponseType<T> | ApiErrorType>;

export type AppType = {
	Variables: {
		dbType: DatabaseTypeSchema;
	};
	Bindings: {
		databases: DatabasesRoutes;
		tables: TablesRoutes;
		records: RecordsRoutes;
		query: QueryRoutes;
		chat: ChatRoutes;
	};
};
