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
	BASE_URL: "https://api.dbstuio.localhost",
	IS_DEV: nodeEnv === "development",
	PROXY_URL:
		env?.DB_STUDIO_PROXY_URL ??
		(nodeEnv === "development"
			? "https://proxy.dbstuio.localhost"
			: "https://db-studio-proxy.husamql3.workers.dev"),
};
