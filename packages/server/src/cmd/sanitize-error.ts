const CONNECTION_URL =
	/\b(?:postgres(?:ql)?|mysql2?|mssql|sqlserver|mongodb(?:\+srv)?|sqlite|rediss?):\/\/\S+/gi;

/**
 * Redact database connection URLs from error text before printing them.
 * The whole URL is replaced — including hosts and credentials that contain
 * `,` or `)`, such as mongodb replica set URIs — while trailing punctuation
 * that belongs to the surrounding prose is kept.
 */
export const sanitizeErrorMessage = (message: string): string => {
	return message.replace(
		CONNECTION_URL,
		(url) => `the configured database${url.match(/[),.]+$/)?.[0] ?? ""}`,
	);
};
