import { intro, log, outro, spinner } from "@clack/prompts";
import { DEFAULTS } from "@db-studio/shared/constants";
import { serve } from "@hono/node-server";
import color from "picocolors";
import { args } from "@/cmd/args.js";
import { getDatabaseUrl } from "@/cmd/get-db-url.js";
import { loadEnv } from "@/cmd/load-env.js";
import { openBrowser, shouldOpenBrowser } from "@/cmd/open-browser.js";
import { showHelp } from "@/cmd/show-help.js";
import { showStatus } from "@/cmd/show-status.js";
import { showVersion } from "@/cmd/show-version.js";

export const main = async () => {
	const { env, port, databaseUrl, varName, open, status, help, version } = args();

	// Handle help flag
	if (help) {
		showHelp();
		process.exit(0);
	}

	// Handle version flag
	if (version) {
		showVersion();
		process.exit(0);
	}

	// Handle status flag
	if (status) {
		await showStatus(env, databaseUrl, varName);
		process.exit(0);
	}

	intro(color.inverse(" db-studio "));

	const PORT = Number.parseInt(port ?? process.env.PORT ?? String(DEFAULTS.PORT), 10);
	const HOST = process.env.HOST;
	const VAR_NAME = varName || DEFAULTS.VAR_NAME;
	const ENV = env ? await loadEnv(env) : await loadEnv();
	const hasEnvFileValue = Boolean(ENV?.[VAR_NAME]);
	const hasProcessValue = Boolean(process.env[VAR_NAME]);
	const DATABASE_URL = databaseUrl ? databaseUrl : await getDatabaseUrl(ENV, VAR_NAME);
	const configSource = databaseUrl
		? "Using database URL from --database-url"
		: hasEnvFileValue
			? `Found ${VAR_NAME} in ${env ?? ".env"}`
			: hasProcessValue
				? `Found ${VAR_NAME} in environment`
				: "Using database URL provided interactively";
	log.success(configSource);

	// Set DATABASE_URL in process.env before importing createServer
	// This ensures the db pool is initialized with the correct connection string
	process.env.DATABASE_URL = DATABASE_URL;

	// Populate other env variables from .env if not already set in process.env
	if (ENV) {
		for (const [key, value] of Object.entries(ENV)) {
			if (process.env[key] === undefined) {
				process.env[key] = value;
			}
		}
	}

	// Import database modules dynamically after setting DATABASE_URL.
	const { checkDatabaseConnection, getDatabaseConnectionDetails } = await import(
		"@/cmd/check-database.js"
	);
	const { type, name, destination } = getDatabaseConnectionDetails(DATABASE_URL);
	const connectionSpinner = spinner();
	connectionSpinner.start(`Connecting to ${name}...`);
	try {
		await checkDatabaseConnection(type);
		connectionSpinner.stop(`Connected to ${name} at ${destination}`);
	} catch (error) {
		connectionSpinner.stop(`Could not connect to ${name} at ${destination}`);
		throw error;
	}

	const { createServer } = await import("./utils/create-server.js");
	const { app } = createServer();
	serve({
		fetch: app.fetch,
		hostname: HOST,
		port: PORT,
	});

	const serverUrl =
		process.env.DB_STUDIO_SERVER_URL ?? process.env.PORTLESS_URL ?? `http://localhost:${PORT}`;

	log.success(`Server listening at ${color.cyan(serverUrl)}`);

	if (shouldOpenBrowser(open)) {
		try {
			await openBrowser(serverUrl);
			log.success("Opened db-studio in your browser");
		} catch {
			log.warn(`Could not open your browser. Visit ${color.cyan(serverUrl)}`);
		}
	}

	outro(color.green("Ready"));
};

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	const sanitizedMessage = message.replace(
		/\b(?:postgres(?:ql)?|mysql2?|mssql|sqlserver|mongodb(?:\+srv)?|sqlite|rediss?):\/\/\S+/gi,
		"the configured database",
	);
	outro(color.red(`Startup failed: ${sanitizedMessage}`));
	process.exit(1);
});
