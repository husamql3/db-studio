import type { BaseResponse, ExecuteQueryResult } from "@db-studio/shared/types";
import { api } from "./client";

export const executeQuery = ({ query, db }: { query: string; db?: string | null }) =>
	api.post<BaseResponse<ExecuteQueryResult>>(
		"/query",
		{ query },
		{ params: { db: db ?? "" } },
	);
