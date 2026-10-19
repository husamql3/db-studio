import type { BaseResponse, ServerLogsResult } from "@db-studio/shared/types";
import { api } from "./client";

export const getServerLogs = (db?: string | null) =>
	api.get<BaseResponse<ServerLogsResult>>("/logs", { params: { db: db ?? "" } });
