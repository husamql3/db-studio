import { intro, note, outro } from "@clack/prompts";
import { DEFAULTS } from "@db-studio/shared/constants";
import { DATABASE_ENGINES } from "@db-studio/shared/types";
import color from "picocolors";
import { getDatabaseUrl } from "@/cmd/get-db-url.js";
import { loadEnv } from "@/cmd/load-env.js";

export const showStatus = async (env?: string, databaseUrl?: string, varName?: string) => {
	intro(color.inverse(" db-studio "));

	const envVarName = varName || DEFAULTS.VAR_NAME;
	const foundUrl = databaseUrl || getDatabaseUrl(await loadEnv(env), envVarName);

	if (foundUrl) {
		outro(color.green(`✓ Database connection configured (using ${envVarName})`));
	} else {
		note(color.red(`✗ ${envVarName} not found`), "Status");
		console.log(color.yellow("\n  To configure database connection:"));
		console.log(
			color.dim(
				`  • Supported databases: ${Object.values(DATABASE_ENGINES)
					.map(({ label }) => label)
					.join(", ")}`,
			),
		);
		console.log(
			color.dim(
				`  • Also via wire-compatible URLs: ${Object.values(DATABASE_ENGINES)
					.flatMap(({ protocols }) => Object.entries(protocols))
					.filter(([, traits]) => "driverScheme" in traits)
					.map(([scheme]) => `${scheme}://`)
					.join(", ")}`,
			),
		);
		console.log(color.dim(`  • Add ${envVarName} to your .env file or set it in process.env`));
		console.log(color.dim("  • Use -d flag: db-studio -d <url>"));
		console.log(color.dim("  • Use -e flag: db-studio -e <path-to-env>"));
		console.log(color.dim("  • Use -n flag: db-studio -n <var-name>\n"));

		outro(color.yellow("⚠ No database connection configured"));
	}
};
