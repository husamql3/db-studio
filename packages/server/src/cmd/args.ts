import { program } from "commander";

type Args = {
	env?: string;
	port?: string;
	databaseUrl?: string;
	varName?: string;
	status?: boolean;
	help?: boolean;
	version?: boolean;
};

/**
 * Get the arguments from the command line
 */
export const args = () => {
	program
		.name("db-studio")
		.option("-e, --env <path>", "Path to custom .env file")
		.option("-p, --port <port>", "Port to run the server on")
		.option("-d, --database-url <url>", "Database URL to use")
		.option(
			"-n, --var-name <name>",
			"Custom environment variable name (default: DATABASE_URL)",
		)
		.option("-s, --status", "Show status of the server")
		.option("-h, --help", "Show help")
		.option("-v, --version", "Show version")
		.parse(process.argv);

	return program.opts<Args>();
};
