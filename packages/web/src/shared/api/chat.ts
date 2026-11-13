import { DEFAULTS } from "@db-studio/shared/constants";
import type { RateLimitResponse } from "@db-studio/shared/types";
import { getBaseUrl, rootApi } from "./client";

export const getRateLimit = () => rootApi.get<RateLimitResponse>("/chat/limit");

/** The chat streams server-sent events outside Axios; send `requestHeaders()` with it. */
export const chatUrl = () => `${getBaseUrl()}${DEFAULTS.API_PREFIX}/chat`;
