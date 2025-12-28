import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse as parseDotenv } from "dotenv";

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
