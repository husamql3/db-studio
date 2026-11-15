/**
 * Row counts on PostgreSQL, MySQL and SQL Server: large tables report the database's row
 * estimate instead of an exact COUNT(*), in the table list and as an unfiltered page total.
 *
 * Failure modes it covers:
 * - a small table reports an estimate, or an estimate flag, instead of its exact count;
 * - a large table is still counted exactly, or its estimate is far from the truth;
 * - PostgreSQL: a table never analyzed (reltuples -1) reports -1 rows instead of being counted;
 * - MySQL and SQL Server: a table emptied after the database reported its size still reports
 *   its old size (MySQL 8 caches the size for a day by default);
 * - a filtered page total uses the table-wide estimate instead of counting matching rows;
 * - a mixed-case table name breaks the lookup.
 *
 *   DATABASE_URL=postgresql://dbstudio:dbstudio@127.0.0.1:5434/dbstudio bunx tsx e2e/row-estimates.ts
 *   DATABASE_URL=mysql://root@127.0.0.1:3306/dbstudio bunx tsx e2e/row-estimates.ts
 *   DATABASE_URL='mssql://sa:DbStudio1!@127.0.0.1:1433/dbstudio' bunx tsx e2e/row-estimates.ts
 *
 * The database must be disposable: the script creates and drops dbstudio_estimate_* tables.
 * Evidence goes to e2e/artifacts/row-estimates-<pg|mysql|mssql>.json.
 */
import assert from "node:assert/strict";
import { tableDataResultSchema, tableInfoSchema } from "@db-studio/shared/types";
import { z } from "zod";
import { inProcessApp, requireDatabaseUrl, writeArtifact } from "./lib.js";

const { call, close, db, dbType } = await inProcessApp(
	requireDatabaseUrl("pg", "mysql", "mssql").url,
);

const { connector } = await import("../src/open-connections.js");

const LARGE = "dbstudio_estimate_Large"; // mixed case, so it must be quoted
const SMALL = "dbstudio_estimate_small";
const ROWS = 100_000;

interface Dialect {
	exec: (sql: string) => Promise<void>;
	quote: (name: string) => string;
	/** Appended to CREATE TABLE. */
	tableOptions: string;
	/** Fills ids 1..rows, with bucket = id % 10. */
	seed: (table: string, rows: number) => Promise<void>;
	/** The table whose stored size is wrong or missing, and the rows it really holds. */
	stale: { table: string; rows: number };
	/** Brings the database's stored sizes to the state the checks expect. */
	settle: () => Promise<void>;
}

const dialect = async (): Promise<Dialect> => {
	if (dbType === "pg") {
		const pool = await connector("pg").pool(db);
		const UNANALYZED = "dbstudio_estimate_unanalyzed";

		return {
			exec: async (sql) => {
				await pool.query(sql);
			},
			quote: (name) => `"${name}"`,
			// Autovacuum must not analyze the unanalyzed table while the script runs.
			tableOptions: "WITH (autovacuum_enabled = false)",
			seed: async (table, rows) => {
				await pool.query(
					`INSERT INTO "${table}" SELECT g, g % 10 FROM generate_series(1, ${rows}) g`,
				);
			},
			stale: { table: UNANALYZED, rows: ROWS },
			settle: async () => {
				await pool.query(`ANALYZE "${LARGE}", "${SMALL}"`);
			},
		};
	}

	const SHRUNK = "dbstudio_estimate_shrunk";

	if (dbType === "mysql") {
		const pool = await connector("mysql").pool(db);

		return {
			exec: async (sql) => {
				await pool.query(sql);
			},
			quote: (name) => `\`${name}\``,
			tableOptions: "",
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
			stale: { table: SHRUNK, rows: 100 },
			// Has MySQL report the table's size, which MySQL 8 then caches, then empties it.
			settle: async () => {
				await pool.query(
					`SELECT table_rows FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '${SHRUNK}'`,
				);
				await pool.query(`DELETE FROM \`${SHRUNK}\` WHERE id > 100`);
			},
		};
	}

	const pool = await connector("mssql").pool(db);

	return {
		exec: async (sql) => {
			await pool.request().query(sql);
		},
		quote: (name) => `[${name}]`,
		tableOptions: "",
		seed: async (table, rows) => {
			await pool
				.request()
				.query(
					`INSERT INTO [${table}] SELECT value, value % 10 FROM GENERATE_SERIES(1, ${rows})`,
				);
		},
		stale: { table: SHRUNK, rows: 100 },
		settle: async () => {
			await pool
				.request()
				.query(
					`SELECT SUM(rows) FROM sys.partitions WHERE object_id = OBJECT_ID('${SHRUNK}')`,
				);
			await pool.request().query(`DELETE FROM [${SHRUNK}] WHERE id > 100`);
		},
	};
};

const { exec, quote, tableOptions, seed, stale, settle } = await dialect();
const STALE = stale.table;

const get = async (path: string) => {
	const { status, body } = await call("GET", path);
	assert.equal(status, 200, JSON.stringify(body));

	return body;
};

const listed = async () => {
	const { data } = z.object({ data: z.array(tableInfoSchema) }).parse(await get("/tables"));

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
	const params = new URLSearchParams({ limit: "5" });

	if (filters) params.set("filters", JSON.stringify(filters));

	const { meta } = z
		.object({ data: tableDataResultSchema })
		.parse(await get(`/tables/${encodeURIComponent(table)}/data?${params}`)).data;

	return { total: meta.total, totalEstimated: meta.totalEstimated };
};

// Estimates are close but not always exact (InnoDB samples index pages).
const within = (value: number, expected: number) =>
	Math.abs(value - expected) / expected < 0.2;

const drop = () => exec(`DROP TABLE IF EXISTS ${[LARGE, SMALL, STALE].map(quote).join(", ")}`);
const evidence: Record<string, unknown> = {};

try {
	await drop();

	for (const [table, rows] of [
		[LARGE, ROWS],
		[SMALL, 100],
		[STALE, ROWS],
	] as const) {
		await exec(
			`CREATE TABLE ${quote(table)} (id INT PRIMARY KEY, bucket INT) ${tableOptions}`,
		);
		await seed(table, rows);
	}

	await settle();

	const list = await listed();
	evidence.list = {
		[LARGE]: {
			rowCountWithinTwentyPercent: within(list[LARGE]?.rowCount ?? 0, ROWS),
			rowCountEstimated: list[LARGE]?.rowCountEstimated,
		},
		[SMALL]: list[SMALL],
		[STALE]: list[STALE],
	};
	assert.deepEqual(evidence.list, {
		[LARGE]: { rowCountWithinTwentyPercent: true, rowCountEstimated: true },
		[SMALL]: { rowCount: 100, rowCountEstimated: undefined },
		[STALE]: { rowCount: stale.rows, rowCountEstimated: undefined },
	});

	const large = await pageTotal(LARGE);
	evidence.pageTotals = {
		[LARGE]: {
			totalWithinTwentyPercent: within(large.total, ROWS),
			...large,
			total: undefined,
		},
		[SMALL]: await pageTotal(SMALL),
		[STALE]: await pageTotal(STALE),
		[`${LARGE} where bucket = 3`]: await pageTotal(LARGE, [
			{ columnName: "bucket", operator: "=", value: "3" },
		]),
	};
	assert.deepEqual(evidence.pageTotals, {
		[LARGE]: { totalWithinTwentyPercent: true, totalEstimated: true, total: undefined },
		[SMALL]: { total: 100, totalEstimated: undefined },
		[STALE]: { total: stale.rows, totalEstimated: undefined },
		[`${LARGE} where bucket = 3`]: { total: ROWS / 10, totalEstimated: undefined },
	});
	console.log(`PASS ${dbType} row estimates for large tables, exact counts otherwise`);
} finally {
	await writeArtifact(`row-estimates-${dbType}.json`, evidence);
	await drop();
	await close();
}
