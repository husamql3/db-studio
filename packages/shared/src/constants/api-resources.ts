/**
 * The route prefixes mounted under `API_PREFIX`. Telemetry names each request after its prefix,
 * and the server's `app.ts` fails typecheck when it mounts a prefix missing from these lists.
 */
export const API_ROOT_RESOURCES = ["connections", "databases", "chat", "telemetry"] as const;

/** The route prefixes mounted under `API_PREFIX/:dbType`. */
export const API_DB_RESOURCES = ["tables", "records", "query", "keys", "logs"] as const;
