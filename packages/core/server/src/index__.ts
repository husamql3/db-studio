import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as p from "@clack/prompts";
import { parse as parseDotenv } from "dotenv";
import color from "picocolors";
import { args } from "./cmd/args.js";
import { getDbUrl } from "./cmd/get-db-url.js";
import { loadEnv } from "./cmd/load-env.js";

// mytool --env .env.local migrate
// mytool -e /path/to/special.env server

// mytool status
// No DATABASE_URL found...

// program
//   .name("db-studio")
//   .option("-e, --env <path>", "Path to custom .env file")
//   .option("-p, --port <port>", "Port to run the server on", "3333")
//   .option("-d, --database-url <url>", "Database URL to use");

// program.parse();
// const opts = program.opts<{ env?: string, port?: string, databaseUrl?: string }>();

// const PORT = opts.port ? parseInt(opts.port) : 3333;
// const DATABASE_URL = opts.databaseUrl;

async function _getDatabaseUrl(): Promise<string> {
	// 1. Try automatic/current .env
	const env = await loadEnv();

	if (env?.DATABASE_URL) {
		return env.DATABASE_URL;
	}

	const s = spinner();
	s.start("Looking for database connection...");

	if (!env) {
		s.message("No .env file found in current directory");
	} else {
		s.message("DATABASE_URL not found in .env");
	}

	const choice = await select({
		message: "How do you want to provide DATABASE_URL?",
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
			validate(value) {
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
			if (parsed.DATABASE_URL) {
				return parsed.DATABASE_URL;
			}
			throw new Error("DATABASE_URL still missing in custom file");
		} catch (e: any) {
			cancel(`Cannot read or parse file: ${color.dim(e.message)}`);
			process.exit(1);
		}
	}

	// 3. Manual input
	s.stop("Manual input...");

	const dbUrl = await text({
		message: "Paste your DATABASE_URL",
		placeholder: "postgresql://user:password@localhost:5432/mydb",
		validate(value) {
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
}

// const DATABASE_URL = databaseUrl ? databaseUrl : await getDatabaseUrl();

const DEFAULTS = {
	PORT: 3333,
	ENV: ".env",
};

export const main = async () => {
	const { env, port, databaseUrl, status, help, version } = args();

	const PORT = port ? parseInt(port, 10) : DEFAULTS.PORT;
	const ENV = env ? await loadEnv(env) : await loadEnv(DEFAULTS.ENV);
	const DATABASE_URL = databaseUrl ? databaseUrl : await getDbUrl(ENV);

	console.log({
		PORT,
		ENV,
		DATABASE_URL,
		// status,
		// help,
		// version,
	});

	p.intro(color.inverse(" db-studio "));
	p.outro(color.green(`Server running at ${color.cyan(`http://localhost:${PORT}`)}`));
};

main().catch((err) => {
	console.error(color.red(`❌ Unexpected error: ${err.message}`));
	process.exit(1);
});
