import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SqlParam } from "@/sqlite-client.js";

let opened = 0;

/**
 * A scratch SQLite or DuckDB file in a temporary directory, opened through its real connector
 * the way the server opens a `--database-url`, so adapters under test reach it with no mocks.
 * `exec` runs statements in order, `rows` reads one query's rows as objects, and `close` closes
 * every open connection and deletes the directory.
 */
export const openEngine = async (
	engine: "sqlite" | "duckdb",
	fileName = `scratch.${engine}`,
) => {
	const dir = mkdtempSync(path.join(tmpdir(), `db-studio-${engine}-`));

	const { closeAllConnections, connector, createConnection, registerConnection } =
		await import("@/open-connections.js");

	registerConnection(
		`engine-${++opened}`,
		createConnection(`${engine}://${path.join(dir, fileName)}`),
	);

	const close = async () => {
		await closeAllConnections();
		rmSync(dir, { recursive: true, force: true });
	};

	if (engine === "sqlite") {
		const client = await connector("sqlite").client();

		return {
			exec: async (...statements: string[]) => {
				await client.batch(statements, "write");
			},
			rows: async (sql: string, args: SqlParam[] = []) => {
				const { columns, rows } = await client.execute({ sql, args });

				return rows.map((row) =>
					Object.fromEntries(columns.map((column, i) => [column, row[i]])),
				);
			},
			close,
		};
	}

	const { withConnection } = connector("duckdb");

	return {
		exec: (...statements: string[]) =>
			withConnection(async (conn) => {
				for (const statement of statements) await conn.run(statement);
			}),
		rows: (sql: string, args: SqlParam[] = []) =>
			withConnection(async (conn) =>
				(await conn.runAndReadAll(sql, args)).getRowObjectsJson(),
			),
		close,
	};
};
