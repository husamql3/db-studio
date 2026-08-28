const env = (
	globalThis as typeof globalThis & {
		process?: {
			env?: {
				NODE_ENV?: string;
				DB_STUDIO_PROXY_URL?: string;
			};
		};
	}
).process?.env;

const nodeEnv = env?.NODE_ENV;

export const DEFAULTS = {
	PORT: 3333,
	ENV: ".env",
	VAR_NAME: "DATABASE_URL",
	BASE_URL: "https://api.db-studio.localhost",
	/**
	 * URL namespace for all HTTP API routes. The API and the SPA are served
	 * from the same origin in self-hosted mode, so the API is mounted under
	 * this prefix to keep it from colliding with client-side (SPA) routes such
	 * as `/table/:name` on a page refresh. See db-studio#214.
	 */
	API_PREFIX: "/api",
	IS_DEV: nodeEnv === "development",
	PROXY_URL:
		env?.DB_STUDIO_PROXY_URL ??
		(nodeEnv === "development"
			? "https://proxy.db-studio.localhost"
			: "https://db-studio-proxy.husamql3.workers.dev"),
};
