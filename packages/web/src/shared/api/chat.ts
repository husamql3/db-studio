import type { RateLimitResponse } from "@db-studio/shared/types";
import { rootApi } from "./client";

export const getRateLimit = () => rootApi.get<RateLimitResponse>("/chat/limit");
