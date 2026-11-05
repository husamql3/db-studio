import type { DuckDBConnection } from "@duckdb/node-api";
import type { ConnectionUrl } from "@/connection-url.js";
import { loadDriver } from "@/drivers.js";
import { openOnce } from "./open-once.js";

export const duckdbConnector = (url: ConnectionUrl, readOnly: boolean) => {
	const filePath = url.file ?? "";

	const handles = openOnce(async () => {
		try {
			const { DuckDBInstance } = await loadDriver("duckdb");

			// Checkpoint on every commit. DuckDB (1.4 and 1.5) cannot replay an ALTER TABLE on a
			// table with a nextval() default from the WAL, so a process that exits before the
			// next checkpoint leaves a file that no longer opens.
			const instance = await DuckDBInstance.create(filePath, {
				checkpoint_threshold: "0b",
				...(readOnly && { access_mode: "READ_ONLY" }),
			});

			return { instance, connection: await instance.connect() };
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);

			if (message.includes("Could not set lock on file")) {
				throw new Error(
					`The DuckDB file "${filePath}" is locked by another process. Close the other program using it and try again. (${message})`,
				);
			}

			throw e;
		}
	});

	let queue: Promise<unknown> = Promise.resolve();

	/**
	 * Run `fn` with the DuckDB connection, opening the file on first use. DuckDB holds one
	 * connection per file, so calls are serialized: a transaction opened inside `fn` cannot
	 * interleave with statements from a concurrent request.
	 */
	const withConnection = <T>(fn: (connection: DuckDBConnection) => Promise<T>): Promise<T> => {
		const run = queue.then(async () => fn((await handles.get()).connection));
		queue = run.catch(() => {});

		return run;
	};

	return {
		withConnection,
		ping: async () => {
			await withConnection((connection) => connection.run("SELECT 1"));
		},
		close: async () => {
			for (const { connection, instance } of await handles.drain()) {
				connection.closeSync();
				instance.closeSync();
			}
		},
	};
};
