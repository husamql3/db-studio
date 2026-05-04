import type { RateLimitResponse } from "shared/types";
import { rootApi } from "./client";

export const getRateLimit = () => rootApi.get<RateLimitResponse>("/chat/limit");
