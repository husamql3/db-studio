export const DEFAULTS = {
	PORT: 3333,
	ENV: ".env",
	VAR_NAME: "DATABASE_URL",
	BASE_URL: "http://localhost:3333",
	PROXY_URL:
		process.env.NODE_ENV === "development"
			? "http://localhost:8787"
			: "https://db-studio-proxy.husamql3.workers.dev",
};
