export const DEFAULTS = {
	PORT: 3333,
	ENV: ".env",
	VAR_NAME: "DATABASE_URL",
	PROXY_URL:
		process.env.NODE_ENV === "development"
			? "http://localhost:8787"
			: "https://db-studio-proxy.husamql3.workers.dev",
};
