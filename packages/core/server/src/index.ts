import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
	cancel,
	intro,
	isCancel,
	note,
	outro,
	select,
	spinner,
	text,
} from "@clack/prompts";
import { program } from "commander";
import { type DotenvParseOutput, parse as parseDotenv } from "dotenv";
import color from "picocolors";
import packageJson from "../../package.json" with { type: "json" };

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

/**
 * Display help information
 */
const showHelp = () => {
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

/**
 * Display version information
 */
const showVersion = () => {
	intro(color.inverse(" db-studio "));
	console.log(color.cyan(`\nVersion: ${color.bold(packageJson.version)}\n`));
	outro(color.green(`🚀 db-studio v${packageJson.version}`));
};

/**
 * Show connection status
 */
const showStatus = async (env?: string, databaseUrl?: string, varName?: string) => {
	intro(color.inverse(" db-studio "));

	const envVarName = varName || "DATABASE_URL";
	let foundUrl: string | null = null;

	// Check if DATABASE_URL is provided via CLI
	if (databaseUrl) {
		foundUrl = databaseUrl;
	} else {
		// Try to load from .env file
		const ENV = env ? await loadEnv(env) : await loadEnv(".env");
		if (ENV?.[envVarName]) {
			foundUrl = ENV[envVarName];
		}
	}

	if (foundUrl) {
		// Mask the password in the URL for security
		try {
			const url = new URL(foundUrl);
			if (url.password) {
				url.password = "****";
			}
			console.log(color.dim(`  Connection: ${url.toString()}\n`));
		} catch {
			console.log(color.dim(`  Connection: ${foundUrl.substring(0, 30)}...\n`));
		}

		outro(color.green(`✓ Database connection configured (using ${envVarName})`));
	} else {
		note(color.red(`✗ ${envVarName} not found`), "Status");
		console.log(color.yellow("\n  To configure database connection:"));
		console.log(color.dim(`  • Add ${envVarName} to your .env file`));
		console.log(color.dim("  • Use -d flag: db-studio -d <url>"));
		console.log(color.dim("  • Use -e flag: db-studio -e <path-to-env>"));
		console.log(color.dim("  • Use -n flag: db-studio -n <var-name>\n"));

		outro(color.yellow("⚠ No database connection configured"));
	}
};

/**
 * Load the environment variables from the file
 */
export const loadEnv = async (env?: string) => {
	const envPath = env ? resolve(env) : resolve(process.cwd(), ".env");

	try {
		await access(envPath);
		const content = await readFile(envPath, "utf-8");
		return parseDotenv(content);
	} catch (err) {
		if (err instanceof Error && err.message.includes("ENOENT")) {
			return null; // we'll handle missing file later
		}
		throw err;
	}
};

/**
 * Get the database URL from the environment variables
 */
export const getDatabaseUrl = async (
	env?: DotenvParseOutput | null,
	varName?: string,
) => {
	const envVarName = varName || "DATABASE_URL";

	if (env?.[envVarName]) {
		return env[envVarName];
	}

	const s = spinner();
	s.start("Looking for database connection...");

	if (!env) {
		note(color.red("No .env file found in current directory"));
	} else {
		note(color.red(`${envVarName} not found in .env`));
	}

	const choice = await select({
		message: `How do you want to provide ${envVarName}?`,
		options: [
			{ value: "manual", label: "Enter connection string manually" },
			{ value: "other-env", label: "Use different .env file" },
			{ value: "cancel", label: "Cancel / Exit" },
		],
		initialValue: "manual",
	});
	if (isCancel(choice) || choice === "cancel") {
		cancel("No database connection provided. Exiting...");
		process.exit(0);
	}

	if (choice === "other-env") {
		s.start("Waiting for path...");
		const customPath = await text({
			message: "Enter path to .env file",
			placeholder: "~/projects/myapp/.env.local or ./special.env",
			validate(value: string) {
				if (!value.trim()) return "Path is required";
			},
		});

		if (isCancel(customPath)) {
			cancel("Cancelled.");
			process.exit(0);
		}

		s.stop("Trying custom .env...");

		const customEnvPath = resolve(customPath);
		try {
			const content = await readFile(customEnvPath, "utf-8");
			const parsed = parseDotenv(content);
			if (parsed[envVarName]) {
				return parsed[envVarName];
			}
			throw new Error(`${envVarName} still missing in custom file`);
		} catch (e: any) {
			cancel(`Cannot read or parse file: ${color.dim(e.message)}`);
			process.exit(1);
		}
	}

	// 3. Manual input
	s.stop("Manual input...");

	const dbUrl = await text({
		message: `Paste your ${envVarName}`,
		placeholder: "postgresql://user:password@localhost:5432/mydb",
		validate(value: string) {
			if (!value.trim()) return "Connection string is required!";
			try {
				new URL(value); // very basic check
				return undefined;
			} catch {
				return "Must be a valid URL format";
			}
		},
	});

	if (isCancel(dbUrl)) {
		cancel("Cancelled.");
		process.exit(0);
	}

	return dbUrl.trim();
};

const DEFAULTS = {
	PORT: 3333,
	ENV: ".env",
	VAR_NAME: "DATABASE_URL",
};

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

	console.log({
		PORT,
		VAR_NAME,
		ENV,
		DATABASE_URL,
	});

	outro(color.green(`Server running at ${color.cyan(`http://localhost:${PORT}`)}`));
};

main().catch((err) => {
	console.error(color.red(`❌ Unexpected error: ${err.message}`));
	process.exit(1);
});
