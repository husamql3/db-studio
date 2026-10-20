import { intro, log, outro, spinner } from "@clack/prompts";
import { DEFAULTS } from "@db-studio/shared/constants";
import color from "picocolors";
import { args } from "@/cmd/args.js";
import { getDatabaseUrl } from "@/cmd/get-db-url.js";
import { loadEnv } from "@/cmd/load-env.js";
import { openBrowser, shouldOpenBrowser } from "@/cmd/open-browser.js";
import { sanitizeErrorMessage } from "@/cmd/sanitize-error.js";
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

	const ENV = env ? await loadEnv(env) : await loadEnv();

	// Populate other env variables from .env if not already set in process.env
	if (ENV) {
		for (const [key, value] of Object.entries(ENV)) {
			if (process.env[key] === undefined) {
				process.env[key] = value;
			}
		}
	}

	const PORT = Number.parseInt(port ?? process.env.PORT ?? String(DEFAULTS.PORT), 10);
	// Loopback only by default: the server holds saved database passwords. HOST opts in to more.
	const HOST = process.env.HOST ?? "127.0.0.1";
	const VAR_NAME = varName || DEFAULTS.VAR_NAME;
	const DATABASE_URL = databaseUrl || getDatabaseUrl(ENV, VAR_NAME);

	const { flushServerObservability, initServerObservability } = await import(
		"@/observability.js"
	);
	initServerObservability();

	if (DATABASE_URL) {
		log.success(
			databaseUrl
				? "Using database URL from --database-url"
				: ENV?.[VAR_NAME]
					? `Found ${VAR_NAME} in ${env ?? ".env"}`
					: `Found ${VAR_NAME} in environment`,
		);
		// Imported after the .env file is loaded: the database layer reads driver settings from it.
		const { getDatabaseConnectionDetails } = await import("@/cmd/check-database.js");
		const { connect } = await import("@/connection.js");
		const details = getDatabaseConnectionDetails(DATABASE_URL);
		const label = details ? `${details.name} at ${details.destination}` : "the database";
		const connectionSpinner = spinner();
		connectionSpinner.start(`Connecting to ${label}...`);
		try {
			await connect(DATABASE_URL);
			connectionSpinner.stop(`Connected to ${label}`);
		} catch (error) {
			connectionSpinner.stop(`Could not connect to ${label}`);
			throw error;
		}
	} else {
		log.info(`No ${VAR_NAME} found. Choose a database in the browser.`);
	}

	const { createServer } = await import("./utils/create-server.js");
	const { closeAllDbPools } = await import("@/db-manager.js");
	const { app } = createServer();

	// Ctrl+C or SIGTERM: let open requests finish, then close the database connections, whose
	// idle timeout would otherwise keep the process alive for 30 s. Registered before listen()
	// so it runs before srvx's own handler, which would stop the server without waiting.
	const stop = async () => {
		const deadline = new Promise((resolve) => setTimeout(resolve, 5_000));
		await Promise.race([app.server?.stop(), deadline]);
		await Promise.race([
			Promise.allSettled([closeAllDbPools(), flushServerObservability()]),
			deadline,
		]);
		process.exit(0);
	};
	process.once("SIGINT", stop);
	process.once("SIGTERM", stop);
	app.listen({ hostname: HOST, port: PORT });

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

if (process.env.NODE_ENV !== "test") {
	main().catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		outro(color.red(`Startup failed: ${sanitizeErrorMessage(message)}`));
		process.exit(1);
	});
}
