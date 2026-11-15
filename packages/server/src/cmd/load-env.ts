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

/** The named `env` file must exist; without one, the nearest `.env` is read when there is one. */
export const loadEnv = async (env?: string) => {
	const envPath = env ? resolve(env) : await findEnvPath(process.cwd());

	if (!envPath) return null;

	try {
		return parseDotenv(await readFile(envPath, "utf-8"));
	} catch (err) {
		if (err instanceof Error && "code" in err && err.code === "ENOENT") {
			if (env) throw new Error(`No .env file at ${envPath}`, { cause: err });

			return null;
		}

		throw err;
	}
};
