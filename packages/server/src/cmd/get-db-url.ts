import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { cancel, isCancel, note, select, spinner, text } from "@clack/prompts";
import { type DotenvParseOutput, parse as parseDotenv } from "dotenv";
import color from "picocolors";

/**
 * Get the database URL from .env file, then process.env
 */
export const getDatabaseUrl = async (env?: DotenvParseOutput | null, varName?: string) => {
	const envVarName = varName || "DATABASE_URL";

	if (env?.[envVarName]) {
		return env[envVarName];
	}

	// Fall back to process.env (e.g. from shell or package.json script)
	if (process.env[envVarName]) {
		return process.env[envVarName];
	}

	const s = spinner();
	s.start("Looking for database connection...");

	if (!env) {
		note(color.red("No .env file found and " + envVarName + " not set in process.env"));
	} else {
		note(color.red(envVarName + " not found in .env or process.env"));
	}

	const choice = await select({
		message: `How do you want to provide ${envVarName}?`,
		options: [
			{ value: "manual", label: "Enter connection string manually" },
			{ value: "other-env", label: "Use different .env file" },
			// todo: add multiple db connections support
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
		} catch (e: unknown) {
			const error = e as Error;
			cancel(`Cannot read or parse file: ${color.dim(error.message)}`);
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
