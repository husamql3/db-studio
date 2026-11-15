import type { BaseResponse, RoutineInfoSchemaType } from "@db-studio/shared/types";
import { api } from "./client";

export const getRoutines = (db?: string | null) =>
	api.get<BaseResponse<RoutineInfoSchemaType[]>>("/routines", { params: { db: db ?? "" } });
