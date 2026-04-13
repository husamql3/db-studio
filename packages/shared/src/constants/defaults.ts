const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3333;

export const DEFAULTS = {
	PORT,
	ENV: ".env",
	VAR_NAME: "DATABASE_URL",
	BASE_URL: process.env.BASE_URL ?? `http://localhost:${PORT}`,
	PROXY_URL:
		process.env.NODE_ENV === "development"
			? "http://localhost:8787"
			: "https://db-studio-proxy.husamql3.workers.dev",
};
