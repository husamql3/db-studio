import { intro, outro } from "@clack/prompts";
import { serve } from "@hono/node-server";
import open from "open";
import color from "picocolors";

import { args } from "@/cmd/args.js";
import { getDatabaseUrl } from "@/cmd/get-db-url.js";
import { loadEnv } from "@/cmd/load-env.js";
import { showHelp } from "@/cmd/show-help.js";
import { showStatus } from "@/cmd/show-status.js";
import { showVersion } from "@/cmd/show-version.js";
import { DEFAULTS } from "@/utils/defaults.js";

export const main = async () => {
	const { env, port, databaseUrl, varName, status, help, version } = args();

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

	const PORT = port ? parseInt(port, 10) : DEFAULTS.PORT;
	const VAR_NAME = varName || DEFAULTS.VAR_NAME;
	const ENV = env ? await loadEnv(env) : await loadEnv(DEFAULTS.ENV);
	const DATABASE_URL = databaseUrl ? databaseUrl : await getDatabaseUrl(ENV, VAR_NAME);

	// Set DATABASE_URL in process.env before importing createServer
	// This ensures the db pool is initialized with the correct connection string
	process.env.DATABASE_URL = DATABASE_URL;

	// Import createServer dynamically after setting DATABASE_URL
	const { createServer } = await import("./utils/create-server.js");
	const { app, injectWebSocket } = createServer();
	const server = serve({
		fetch: app.fetch,
		port: PORT,
	});
	injectWebSocket(server);

	outro(color.green(`Server running at ${color.cyan(`http://localhost:${PORT}`)}`));

	await open(`http://localhost:${PORT}`);
};

main().catch((err) => {
	console.error(color.red(`❌ Unexpected error: ${err.message}`));
	process.exit(1);
});
