import { DATABASE_ENGINES } from "@db-studio/shared/types";

const SCHEMES = Object.values(DATABASE_ENGINES)
	.flatMap(({ protocols }) => protocols)
	.map((protocol) => protocol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
	.join("|");
const CONNECTION_URL = new RegExp(`\\b(?:${SCHEMES}):\\/\\/\\S+`, "gi");
const AUTH_TOKEN = /\b(authToken=)[^&\s]+/gi;

/**
 * Redact database connection URLs from error text before printing them.
 * The whole URL is replaced — including hosts and credentials that contain
 * `,` or `)`, such as mongodb replica set URIs — while trailing punctuation
 * that belongs to the surrounding prose is kept.
 */
export const sanitizeErrorMessage = (message: string): string => {
	return message
		.replace(
			CONNECTION_URL,
			(url) => `the configured database${url.match(/[),.]+$/)?.[0] ?? ""}`,
		)
		.replace(AUTH_TOKEN, "$1[redacted]");
};
