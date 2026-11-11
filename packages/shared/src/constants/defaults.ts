export const DEFAULTS = {
	PORT: 3333,
	VAR_NAME: "DATABASE_URL",
	BASE_URL: "https://api.db-studio.localhost",
	/**
	 * URL namespace for all HTTP API routes. The API and the SPA are served
	 * from the same origin in self-hosted mode, so the API is mounted under
	 * this prefix to keep it from colliding with client-side (SPA) routes such
	 * as `/table/:name` on a page refresh. See db-studio#214.
	 */
	API_PREFIX: "/api",
};
