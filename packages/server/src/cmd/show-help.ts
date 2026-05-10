import { intro, outro } from "@clack/prompts";
import { META } from "@db-studio/shared/constants/meta.js";
import color from "picocolors";

/**
 * Display help information
 */
export const showHelp = () => {
	intro(color.inverse(" db-studio "));

	console.log(color.bold("\nUsage:"));
	console.log("  dbstudio [options]\n");

	console.log(color.bold("Supported Databases:"));
	console.log("  MySQL, PostgreSQL\n");

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
	console.log("  dbstudio");
	console.log("  dbstudio -e .env.local");
	console.log("  dbstudio -p 4000");
	console.log("  dbstudio -d postgresql://user:pass@localhost:5432/mydb");
	console.log("  dbstudio -n MY_DATABASE_URL");
	console.log("  dbstudio -e .env.production -n PROD_DB_URL");
	console.log("  dbstudio --status\n");

	outro(color.green(`For more information, visit: ${META.SITE_DOCS_LINK}`));
};
