/**
 * Row counts on MySQL and SQL Server: large tables report the database's row estimate instead
 * of an exact COUNT(*), in the table list and as an unfiltered page total.
 *
 * Failure modes it covers:
 * - a small table reports an estimate, or an estimate flag, instead of its exact count;
 * - a large table is still counted exactly, or its estimate is far from the truth;
 * - a table emptied after the database reported its size still reports its old size (MySQL 8
 *   caches the size for a day by default);
 * - a filtered page total uses the table-wide estimate instead of counting matching rows;
 * - a mixed-case table name breaks the lookup.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3306/dbstudio bunx tsx e2e/row-estimates.ts
 *   DATABASE_URL='mssql://sa:DbStudio1!@127.0.0.1:1433/dbstudio' bunx tsx e2e/row-estimates.ts
 *
 * The database must be disposable: the script creates and drops dbstudio_estimate_* tables.
 * Evidence goes to e2e/artifacts/row-estimates-<mysql|mssql>.json.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tableDataResultSchema, tableInfoSchema } from "@db-studio/shared/types";
import { z } from "zod";

process.env.DB_STUDIO_TELEMETRY = "0";
const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
const dbType = { "mysql:": "mysql", "mssql:": "mssql" }[databaseUrl.protocol];
if (!dbType) throw new Error("Set DATABASE_URL to a disposable MySQL or SQL Server database");
const db = decodeURIComponent(databaseUrl.pathname.slice(1));
const { createServer } = await import("../src/utils/create-server.js");
const { getMssqlPool, getMysqlPool } = await import("../src/db-manager.js");
const { app } = createServer();

const LARGE = "dbstudio_estimate_Large"; // mixed case
const SMALL = "dbstudio_estimate_small";
const SHRUNK = "dbstudio_estimate_shrunk";
const ROWS = 100_000;

interface Dialect {
	exec: (sql: string) => Promise<unknown>;
	quote: (name: string) => string;
	/** Fills ids 1..rows, with bucket = id % 10. */
	seed: (table: string, rows: number) => Promise<unknown>;
	/** Has the database report the table's size, which MySQL 8 then caches. */
	readSize: (table: string) => Promise<unknown>;
	end: () => Promise<unknown>;
}

const dialect = async (): Promise<Dialect> => {
	if (dbType === "mysql") {
		const pool = await getMysqlPool(db);
		return {
			exec: (sql) => pool.query(sql),
			quote: (name) => `\`${name}\``,
			seed: async (table, rows) => {
				const connection = await pool.getConnection();
				try {
					await connection.query(`SET SESSION cte_max_recursion_depth = ${rows}`);
					await connection.query(
						`INSERT INTO \`${table}\` WITH RECURSIVE seq (n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < ${rows}) SELECT n, n % 10 FROM seq`,
					);
				} finally {
					connection.release();
				}
			},
			readSize: (table) =>
				pool.query(
					`SELECT table_rows FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '${table}'`,
				),
			end: () => pool.end(),
		};
	}
	const pool = await getMssqlPool(db);
	return {
		exec: (sql) => pool.request().query(sql),
		quote: (name) => `[${name}]`,
		seed: (table, rows) =>
			pool
				.request()
				.query(
					`INSERT INTO [${table}] SELECT value, value % 10 FROM GENERATE_SERIES(1, ${rows})`,
				),
		readSize: (table) =>
			pool
				.request()
				.query(`SELECT SUM(rows) FROM sys.partitions WHERE object_id = OBJECT_ID('${table}')`),
		end: () => pool.close(),
	};
};
const { exec, quote, seed, readSize, end } = await dialect();

const get = async (path: string) => {
	const response = await app.handle(
		new Request(new URL(`/api/${dbType}${path}`, "http://localhost")),
	);
	const body: unknown = await response.json();
	assert.equal(response.status, 200, JSON.stringify(body));
	return body;
};
const listed = async () => {
	const { data } = z
		.object({ data: z.array(tableInfoSchema) })
		.parse(await get(`/tables?db=${encodeURIComponent(db)}`));
	return Object.fromEntries(
		data
			.filter((table) => table.tableName.startsWith("dbstudio_estimate_"))
			.map(({ tableName, rowCount, rowCountEstimated }) => [
				tableName,
				{ rowCount, rowCountEstimated },
			]),
	);
};
const pageTotal = async (table: string, filters?: unknown[]) => {
	const params = new URLSearchParams({ db, limit: "5" });
	if (filters) params.set("filters", JSON.stringify(filters));
	const { meta } = z
		.object({ data: tableDataResultSchema })
		.parse(await get(`/tables/${encodeURIComponent(table)}/data?${params}`)).data;
	return { total: meta.total, totalEstimated: meta.totalEstimated };
};
// Estimates are close but not always exact (InnoDB samples index pages).
const within = (value: number, expected: number) =>
	Math.abs(value - expected) / expected < 0.2;

const drop = () =>
	exec(`DROP TABLE IF EXISTS ${[LARGE, SMALL, SHRUNK].map(quote).join(", ")}`);
const evidence: Record<string, unknown> = {};
try {
	await drop();
	for (const [table, rows] of [
		[LARGE, ROWS],
		[SMALL, 100],
		[SHRUNK, ROWS],
	] as const) {
		await exec(`CREATE TABLE ${quote(table)} (id INT PRIMARY KEY, bucket INT)`);
		await seed(table, rows);
	}
	await readSize(SHRUNK);
	await exec(`DELETE FROM ${quote(SHRUNK)} WHERE id > 100`);

	const list = await listed();
	evidence.list = {
		[LARGE]: {
			rowCountWithinTwentyPercent: within(list[LARGE]?.rowCount ?? 0, ROWS),
			rowCountEstimated: list[LARGE]?.rowCountEstimated,
		},
		[SMALL]: list[SMALL],
		[SHRUNK]: list[SHRUNK],
	};
	assert.deepEqual(evidence.list, {
		[LARGE]: { rowCountWithinTwentyPercent: true, rowCountEstimated: true },
		[SMALL]: { rowCount: 100, rowCountEstimated: undefined },
		[SHRUNK]: { rowCount: 100, rowCountEstimated: undefined },
	});

	const large = await pageTotal(LARGE);
	evidence.pageTotals = {
		[LARGE]: {
			totalWithinTwentyPercent: within(large.total, ROWS),
			...large,
			total: undefined,
		},
		[SMALL]: await pageTotal(SMALL),
		[SHRUNK]: await pageTotal(SHRUNK),
		[`${LARGE} where bucket = 3`]: await pageTotal(LARGE, [
			{ columnName: "bucket", operator: "=", value: "3" },
		]),
	};
	assert.deepEqual(evidence.pageTotals, {
		[LARGE]: { totalWithinTwentyPercent: true, totalEstimated: true, total: undefined },
		[SMALL]: { total: 100, totalEstimated: undefined },
		[SHRUNK]: { total: 100, totalEstimated: undefined },
		[`${LARGE} where bucket = 3`]: { total: ROWS / 10, totalEstimated: undefined },
	});
	console.log(`PASS ${dbType} row estimates for large tables, exact counts otherwise`);
} finally {
	await mkdir(new URL("./artifacts/", import.meta.url), { recursive: true });
	await writeFile(
		new URL(`./artifacts/row-estimates-${dbType}.json`, import.meta.url),
		`${JSON.stringify(evidence, null, 2)}\n`,
	);
	await drop();
	await end();
}
