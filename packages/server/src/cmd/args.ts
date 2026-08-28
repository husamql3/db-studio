import type { Args } from "@db-studio/shared/types";
import { program } from "commander";

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
		.option("--open", "Open db-studio in the default browser")
		.option("--no-open", "Do not open db-studio in the default browser")
		.option("-s, --status", "Show status of the server")
		.option("-h, --help", "Show help")
		.option("-v, --version", "Show version")
		.parse(process.argv);

	const options = program.opts<Args>();
	const hasOpen = process.argv.includes("--open");
	const hasNoOpen = process.argv.includes("--no-open");
	if (hasOpen && hasNoOpen) {
		program.error("Do not combine --open and --no-open");
	}
	const open = hasOpen ? true : hasNoOpen ? false : undefined;

	return { ...options, open };
};
