/**
 * Row counts on PostgreSQL: large tables report the planner's estimate instead of an exact
 * COUNT(*), in the table list and as an unfiltered page total.
 *
 * Failure modes it covers:
 * - a small table reports an estimate, or an estimate flag, instead of its exact count;
 * - a table never analyzed (reltuples -1) reports -1 rows instead of being counted;
 * - a large analyzed table is still counted exactly, or its estimate is far from the truth;
 * - a filtered page total uses the table-wide estimate instead of counting matching rows;
 * - a mixed-case table name breaks the catalog lookup.
 *
 *   DATABASE_URL=postgresql://... bun run --cwd packages/server tsx e2e/pg-row-estimates.ts
 *
 * The database must be disposable: the script creates and drops dbstudio_estimate_* tables.
 * Evidence goes to e2e/artifacts/pg-row-estimates.json.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tableDataResultSchema, tableInfoSchema } from "@db-studio/shared/types";
import { z } from "zod";

process.env.DB_STUDIO_TELEMETRY = "0";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.startsWith("postgresql://")) {
	throw new Error("Set DATABASE_URL to a disposable PostgreSQL database");
}
const db = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
const { createServer } = await import("../src/utils/create-server.js");
const { getDbPool } = await import("../src/db-manager.js");
const { app } = createServer();
const pool = await getDbPool(db);

const LARGE = "dbstudio_estimate_Large"; // mixed case, so it must be quoted
const SMALL = "dbstudio_estimate_small";
const UNANALYZED = "dbstudio_estimate_unanalyzed";
const ROWS = 60_000;

const get = async (path: string) => {
	const response = await app.handle(
		new Request(new URL(`/api/pg${path}`, "http://localhost")),
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
const within = (value: number, expected: number) =>
	Math.abs(value - expected) / expected < 0.1;

const drop = () => pool.query(`DROP TABLE IF EXISTS "${LARGE}", "${SMALL}", "${UNANALYZED}"`);
const evidence: Record<string, unknown> = {};
try {
	await drop();
	for (const [table, rows] of [
		[LARGE, ROWS],
		[SMALL, 100],
		[UNANALYZED, ROWS],
	] as const) {
		// Autovacuum must not analyze the unanalyzed table while the script runs.
		await pool.query(
			`CREATE TABLE "${table}" (id INT PRIMARY KEY, bucket INT) WITH (autovacuum_enabled = false)`,
		);
		await pool.query(
			`INSERT INTO "${table}" SELECT g, g % 10 FROM generate_series(1, ${rows}) g`,
		);
	}
	await pool.query(`ANALYZE "${LARGE}", "${SMALL}"`);

	const list = await listed();
	evidence.list = {
		[LARGE]: {
			rowCountWithinTenPercent: within(list[LARGE]?.rowCount ?? 0, ROWS),
			rowCountEstimated: list[LARGE]?.rowCountEstimated,
		},
		[SMALL]: list[SMALL],
		[UNANALYZED]: list[UNANALYZED],
	};
	assert.deepEqual(evidence.list, {
		[LARGE]: { rowCountWithinTenPercent: true, rowCountEstimated: true },
		[SMALL]: { rowCount: 100, rowCountEstimated: undefined },
		[UNANALYZED]: { rowCount: ROWS, rowCountEstimated: undefined },
	});

	const large = await pageTotal(LARGE);
	evidence.pageTotals = {
		[LARGE]: { totalWithinTenPercent: within(large.total, ROWS), ...large, total: undefined },
		[SMALL]: await pageTotal(SMALL),
		[UNANALYZED]: await pageTotal(UNANALYZED),
		[`${LARGE} where bucket = 3`]: await pageTotal(LARGE, [
			{ columnName: "bucket", operator: "=", value: "3" },
		]),
	};
	assert.deepEqual(evidence.pageTotals, {
		[LARGE]: { totalWithinTenPercent: true, totalEstimated: true, total: undefined },
		[SMALL]: { total: 100, totalEstimated: undefined },
		[UNANALYZED]: { total: ROWS, totalEstimated: undefined },
		[`${LARGE} where bucket = 3`]: { total: ROWS / 10, totalEstimated: undefined },
	});
	console.log("PASS PostgreSQL row estimates for large tables, exact counts otherwise");
} finally {
	await mkdir(new URL("./artifacts/", import.meta.url), { recursive: true });
	await writeFile(
		new URL("./artifacts/pg-row-estimates.json", import.meta.url),
		`${JSON.stringify(evidence, null, 2)}\n`,
	);
	await drop();
	await pool.end();
}
