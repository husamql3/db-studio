import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parse as parseDotenv } from "dotenv";

const findEnvPath = async (startDir: string): Promise<string | null> => {
	let dir = resolve(startDir);

	for (;;) {
		const envPath = resolve(dir, ".env");

		try {
			await access(envPath);

			return envPath;
		} catch {
			// ENOENT or other: try parent
		}

		const parent = dirname(dir);

		if (parent === dir) return null;
		dir = parent;
	}
};

export const loadEnv = async (env?: string) => {
	let envPath: string | null;

	if (env) {
		envPath = resolve(env);
	} else {
		envPath = await findEnvPath(process.cwd());
	}

	if (!envPath) return null;

	try {
		const content = await readFile(envPath, "utf-8");

		return parseDotenv(content);
	} catch (err) {
		if (err instanceof Error && err.message.includes("ENOENT")) {
			return null;
		}

		throw err;
	}
};
