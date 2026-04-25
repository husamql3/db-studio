const nodeEnv = (
	globalThis as typeof globalThis & {
		process?: {
			env?: {
				NODE_ENV?: string;
			};
		};
	}
).process?.env?.NODE_ENV;

export const DEFAULTS = {
	PORT: 3333,
	ENV: ".env",
	VAR_NAME: "DATABASE_URL",
	BASE_URL: "http://localhost:3333",
	IS_DEV: nodeEnv === "development",
	PROXY_URL:
		nodeEnv === "development"
			? "http://localhost:8787"
			: "https://db-studio-proxy.husamql3.workers.dev",
};
