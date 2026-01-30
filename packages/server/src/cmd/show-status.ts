import { intro, note, outro } from "@clack/prompts";
import color from "picocolors";
import { DEFAULTS } from "shared/constants";
import { loadEnv } from "@/cmd/load-env.js";

/**
 * Show connection status
 */
export const showStatus = async (env?: string, databaseUrl?: string, varName?: string) => {
	intro(color.inverse(" db-studio "));

	const envVarName = varName || DEFAULTS.VAR_NAME;
	let foundUrl: string | null = null;

	// Check if DATABASE_URL is provided via CLI
	if (databaseUrl) {
		foundUrl = databaseUrl;
	} else {
		// Try .env file, then process.env
		const ENV = env ? await loadEnv(env) : await loadEnv();
		if (ENV?.[envVarName]) {
			foundUrl = ENV[envVarName];
		} else if (process.env[envVarName]) {
			foundUrl = process.env[envVarName] ?? null;
		}
	}

	if (foundUrl) {
		outro(color.green(`✓ Database connection configured (using ${envVarName})`));
	} else {
		note(color.red(`✗ ${envVarName} not found`), "Status");
		console.log(color.yellow("\n  To configure database connection:"));
		console.log(color.dim(`  • Add ${envVarName} to your .env file or set it in process.env`));
		console.log(color.dim("  • Use -d flag: db-studio -d <url>"));
		console.log(color.dim("  • Use -e flag: db-studio -e <path-to-env>"));
		console.log(color.dim("  • Use -n flag: db-studio -n <var-name>\n"));

		outro(color.yellow("⚠ No database connection configured"));
	}
};
