import { intro, outro } from "@clack/prompts";
import color from "picocolors";

/**
 * Display help information
 */
export const showHelp = () => {
	intro(color.inverse(" db-studio "));

	console.log(color.bold("\nUsage:"));
	console.log("  db-studio [options]\n");

	console.log(color.bold("Options:"));
	console.log("  -e, --env <path>         Path to custom .env file");
	console.log("  -p, --port <port>        Port to run the server on (default: 3333)");
	console.log("  -d, --database-url <url> Database URL to use");
	console.log(
		"  -n, --var-name <name>    Custom environment variable name (default: DATABASE_URL)",
	);
	console.log("  -s, --status             Show status of the database connection");
	console.log("  -h, --help               Show this help message");
	console.log("  -v, --version            Show version number\n");

	console.log(color.bold("Examples:"));
	console.log("  db-studio");
	console.log("  db-studio -e .env.local");
	console.log("  db-studio -p 4000");
	console.log("  db-studio -d postgresql://user:pass@localhost:5432/mydb");
	console.log("  db-studio -n MY_DATABASE_URL");
	console.log("  db-studio -e .env.production -n PROD_DB_URL");
	console.log("  db-studio --status\n");

	outro(
		color.green("For more information, visit: https://github.com/your-repo/db-studio"),
	);
};
