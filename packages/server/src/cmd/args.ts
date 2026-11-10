import { DEFAULTS, META } from "@db-studio/shared/constants";
import { DATABASE_ENGINES } from "@db-studio/shared/types";
import { program } from "commander";

type Args = {
	env?: string;
	port?: string;
	databaseUrl?: string;
	varName?: string;
	open?: boolean;
	status?: boolean;
	version?: boolean;
};

const HELP_FOOTER = `
Supported databases:
  ${Object.values(DATABASE_ENGINES)
		.map(({ label }) => label)
		.join(", ")}

Without a database URL, open the printed address and choose one in the browser.
Connections are saved to ~/.dbstudio/connections.json.

Examples:
  db-studio
  db-studio -e .env.local
  db-studio -p 4000
  db-studio -d postgresql://user:pass@localhost:5432/mydb
  db-studio -n MY_DATABASE_URL
  db-studio -e .env.production -n PROD_DB_URL
  db-studio --status

For more information, visit: ${META.SITE_DOCS_LINK}`;

export const args = () => {
	program
		.name("db-studio")
		.option("-e, --env <path>", "Path to custom .env file")
		.option("-p, --port <port>", `Port to run the server on (default: ${DEFAULTS.PORT})`)
		.option("-d, --database-url <url>", "Database URL to use")
		.option(
			"-n, --var-name <name>",
			`Custom environment variable name (default: ${DEFAULTS.VAR_NAME})`,
		)
		.option("--open", "Open db-studio in the default browser")
		.option("--no-open", "Do not open db-studio in the default browser")
		.option("-s, --status", "Show whether a database URL is configured")
		.helpOption("-h, --help", "Show help")
		.option("-v, --version", "Show version")
		.addHelpText("after", HELP_FOOTER)
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
