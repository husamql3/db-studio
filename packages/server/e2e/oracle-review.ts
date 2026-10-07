import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULTS } from "@db-studio/shared/constants";

process.env.TZ = "UTC";
process.env.DB_STUDIO_TELEMETRY = "0";

type Method = "GET" | "POST" | "PATCH" | "DELETE";
type Row = Record<string, unknown>;
type Scenario = { name: string; ok: boolean; evidence: unknown; error?: string };

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.startsWith("oracle://")) {
	console.error("usage: DATABASE_URL=oracle://... bunx tsx e2e/oracle-review.ts");
	process.exit(2);
}

const parsedDatabaseUrl = new URL(databaseUrl);
const db = decodeURIComponent(parsedDatabaseUrl.pathname.slice(1));
const { createServer } = await import("../src/utils/create-server.js");
const { app } = createServer();
const scenarios: Scenario[] = [];

const recordOf = (value: unknown): Row => {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`expected object, got ${JSON.stringify(value)}`);
	}
	return value as Row;
};

const dataOf = (body: unknown) => recordOf(body).data;
const rowsOf = (body: unknown) => {
	const rows = recordOf(dataOf(body)).rows;
	if (!Array.isArray(rows)) throw new Error("query response has no rows array");
	return rows.map(recordOf);
};

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

const equal = (actual: unknown, expected: unknown, message: string) => {
	const a = JSON.stringify(actual);
	const e = JSON.stringify(expected);
	assert(a === e, `${message}: expected ${e}, got ${a}`);
};

const api = async (
	method: Method,
	path: string,
	body?: unknown,
	expected: number | number[] = 200,
) => {
	const url = new URL(`${DEFAULTS.API_PREFIX}${path}`, "http://db-studio.local");
	url.searchParams.set("db", db);
	const response = await app.request(`${url.pathname}${url.search}`, {
		method,
		headers: body === undefined ? {} : { "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const text = await response.text();
	let parsed: unknown = text;
	try {
		parsed = JSON.parse(text);
	} catch {}
	const accepted = Array.isArray(expected) ? expected : [expected];
	assert(
		accepted.includes(response.status),
		`${method} ${path} returned ${response.status}: ${text.slice(0, 300)}`,
	);
	return parsed;
};

const query = (sql: string, expected: number | number[] = 200) =>
	api("POST", "/oracle/query", { query: sql }, expected);

const dropTable = (table: string) =>
	query(`BEGIN
		EXECUTE IMMEDIATE 'DROP TABLE "${table}" PURGE';
	EXCEPTION WHEN OTHERS THEN
		IF SQLCODE != -942 THEN RAISE; END IF;
	END;`);

const run = async <T>(name: string, probe: () => Promise<T>, check: (evidence: T) => void) => {
	let evidence: unknown = null;
	try {
		evidence = await probe();
		check(evidence as T);
		scenarios.push({ name, ok: true, evidence });
		console.log(`PASS  ${name}`);
	} catch (cause) {
		const error = cause instanceof Error ? cause.message : String(cause);
		scenarios.push({ name, ok: false, evidence, error });
		console.log(`FAIL  ${name}  -- ${error}`);
	}
};

await run(
	"composite foreign key force delete matches the whole reference",
	async () => {
		await dropTable("oracle_review_child");
		await dropTable("oracle_review_parent");
		await query(`CREATE TABLE "oracle_review_parent" (
			"id" NUMBER PRIMARY KEY,
			"a" NUMBER NOT NULL,
			"b" NUMBER NOT NULL,
			CONSTRAINT "oracle_review_parent_pair" UNIQUE ("a", "b")
		)`);
		await query(`CREATE TABLE "oracle_review_child" (
			"id" NUMBER PRIMARY KEY,
			"a" NUMBER,
			"b" NUMBER,
			"label" VARCHAR2(40),
			CONSTRAINT "oracle_review_child_pair" FOREIGN KEY ("a", "b")
				REFERENCES "oracle_review_parent" ("a", "b")
		)`);
		await query(`INSERT ALL
			INTO "oracle_review_parent" VALUES (1, 1, 1)
			INTO "oracle_review_parent" VALUES (2, 1, 2)
		SELECT 1 FROM dual`);
		await query(`INSERT ALL
			INTO "oracle_review_child" VALUES (11, 1, 1, 'matching')
			INTO "oracle_review_child" VALUES (12, 1, 2, 'sibling')
			INTO "oracle_review_child" VALUES (13, 1, NULL, 'partial-null-b')
			INTO "oracle_review_child" VALUES (14, NULL, 1, 'partial-null-a')
		SELECT 1 FROM dual`);

		const blocked = await api(
			"DELETE",
			"/oracle/records",
			{ tableName: "oracle_review_parent", primaryKeys: [{ columnName: "id", value: 1 }] },
			409,
		);
		const forced = await api("DELETE", "/oracle/records/force", {
			tableName: "oracle_review_parent",
			primaryKeys: [{ columnName: "id", value: 1 }],
		});
		const parents = rowsOf(
			await query('SELECT "id", "a", "b" FROM "oracle_review_parent" ORDER BY "id"'),
		);
		const children = rowsOf(
			await query('SELECT "id", "a", "b", "label" FROM "oracle_review_child" ORDER BY "id"'),
		);
		return {
			blocked: dataOf(blocked),
			forced: dataOf(forced),
			parents,
			children,
		};
	},
	({ blocked, forced, parents, children }) => {
		const related = recordOf(blocked).relatedRecords;
		assert(Array.isArray(related), "delete response has no relatedRecords array");
		equal(related.length, 1, "related constraint count");
		equal(recordOf(related[0]).columnName, "a, b", "related columns");
		equal(
			(recordOf(related[0]).records as Row[]).map((row) => row.id),
			[11],
			"related child ids",
		);
		equal(recordOf(forced).deletedCount, 2, "force deleted count");
		equal(
			parents.map((row) => row.id),
			[2],
			"remaining parent ids",
		);
		equal(
			children.map((row) => row.id),
			[12, 13, 14],
			"remaining child ids",
		);
	},
);

await run(
	"timestamp keys retain nanoseconds through read and edit",
	async () => {
		await dropTable("oracle_review_timestamp");
		await query(`CREATE TABLE "oracle_review_timestamp" (
			"stamp" TIMESTAMP(9) PRIMARY KEY,
			"label" VARCHAR2(40)
		)`);
		await query(`INSERT ALL
			INTO "oracle_review_timestamp" VALUES (
				TO_TIMESTAMP('2026-10-07T12:34:56.123000000', 'YYYY-MM-DD"T"HH24:MI:SS.FF9'),
				'control'
			)
			INTO "oracle_review_timestamp" VALUES (
				TO_TIMESTAMP('2026-10-07T12:34:56.123456789', 'YYYY-MM-DD"T"HH24:MI:SS.FF9'),
				'target'
			)
		SELECT 1 FROM dual`);
		const nativeQuery = await query(
			'SELECT "stamp", "label" FROM "oracle_review_timestamp" ORDER BY "label"',
			400,
		);
		const queryBefore = rowsOf(
			await query(`SELECT
				TO_CHAR("stamp", 'YYYY-MM-DD"T"HH24:MI:SS.FF9') AS "stamp",
				"label"
			FROM "oracle_review_timestamp" ORDER BY "label"`),
		);
		const tableBefore = recordOf(
			dataOf(
				await api(
					"GET",
					"/oracle/tables/oracle_review_timestamp/data?limit=10&sort=label&order=asc",
				),
			),
		).data as Row[];
		const target = tableBefore.find((row) => row.label === "target");
		assert(target, "target row missing from table data");
		await api("PATCH", "/oracle/records", {
			tableName: "oracle_review_timestamp",
			primaryKey: "stamp",
			updates: [{ rowData: target, columnName: "label", value: "target-edited" }],
		});
		const after = rowsOf(
			await query(`SELECT
				TO_CHAR("stamp", 'YYYY-MM-DD"T"HH24:MI:SS.FF9') AS "stamp",
				"label"
			FROM "oracle_review_timestamp" ORDER BY "stamp"`),
		);
		return { nativeQuery, queryBefore, tableBefore, after };
	},
	({ nativeQuery, queryBefore, tableBefore, after }) => {
		const expectedStamps = ["2026-10-07T12:34:56.123000000", "2026-10-07T12:34:56.123456789"];
		equal(
			recordOf(nativeQuery).error,
			"Oracle query results with native DATE or TIMESTAMP columns must use TO_CHAR with an explicit format so fractional seconds are not lost.",
			"native temporal query limitation",
		);
		equal(
			queryBefore.map((row) => row.stamp).sort(),
			expectedStamps,
			"query runner timestamps",
		);
		equal(tableBefore.map((row) => row.stamp).sort(), expectedStamps, "table timestamps");
		equal(
			after.map((row) => [row.stamp, row.label]),
			[
				[expectedStamps[0], "control"],
				[expectedStamps[1], "target-edited"],
			],
			"rows after timestamp-key edit",
		);
	},
);

await run(
	"DATE and zoned timestamp writes use stable formats",
	async () => {
		await dropTable("oracle_review_temporal");
		await query(`CREATE TABLE "oracle_review_temporal" (
			"id" NUMBER PRIMARY KEY,
			"date_value" DATE,
			"timestamp_value" TIMESTAMP(9),
			"tz_value" TIMESTAMP(9) WITH TIME ZONE,
			"ltz_value" TIMESTAMP(9) WITH LOCAL TIME ZONE
		)`);
		await api("POST", "/oracle/records/bulk", {
			tableName: "oracle_review_temporal",
			records: [
				{
					id: 1,
					date_value: null,
					timestamp_value: null,
					tz_value: null,
					ltz_value: null,
				},
				{
					id: 2,
					date_value: "2025-01-02T03:04:05",
					timestamp_value: "2025-01-02T03:04:05.987654321",
					tz_value: "2025-01-02T03:04:05.987654321-05:30",
					ltz_value: "2025-01-02T03:04:05.987654321-05:30",
				},
			],
		});
		const rowData = { id: 1 };
		await api("PATCH", "/oracle/records", {
			tableName: "oracle_review_temporal",
			primaryKey: "id",
			updates: [
				{ rowData, columnName: "date_value", value: "2026-10-07T12:34:56" },
				{
					rowData,
					columnName: "timestamp_value",
					value: "2026-10-07T12:34:56.123456789",
				},
				{
					rowData,
					columnName: "tz_value",
					value: "2026-10-07T12:34:56.123456789+03:00",
				},
				{
					rowData,
					columnName: "ltz_value",
					value: "2026-10-07T12:34:56.123456789+03:00",
				},
			],
		});
		return rowsOf(
			await query(`SELECT "id",
				TO_CHAR("date_value", 'YYYY-MM-DD"T"HH24:MI:SS') AS "date_value",
				TO_CHAR("timestamp_value", 'YYYY-MM-DD"T"HH24:MI:SS.FF9') AS "timestamp_value",
				TO_CHAR("tz_value", 'YYYY-MM-DD"T"HH24:MI:SS.FF9TZH:TZM') AS "tz_value",
				TO_CHAR("ltz_value", 'YYYY-MM-DD"T"HH24:MI:SS.FF9') AS "ltz_value"
			FROM "oracle_review_temporal" ORDER BY "id"`),
		);
	},
	(rows) => {
		const [row, bulkRow] = rows;
		assert(row && bulkRow, "temporal rows missing");
		equal(row.date_value, "2026-10-07T12:34:56", "DATE value");
		equal(row.timestamp_value, "2026-10-07T12:34:56.123456789", "TIMESTAMP value");
		equal(row.tz_value, "2026-10-07T12:34:56.123456789+03:00", "TIMESTAMP TZ value");
		equal(
			row.ltz_value,
			"2026-10-07T09:34:56.123456789",
			"TIMESTAMP LOCAL TZ value in UTC session",
		);
		equal(bulkRow.date_value, "2025-01-02T03:04:05", "bulk DATE value");
		equal(bulkRow.timestamp_value, "2025-01-02T03:04:05.987654321", "bulk TIMESTAMP value");
		equal(bulkRow.tz_value, "2025-01-02T03:04:05.987654321-05:30", "bulk TIMESTAMP TZ value");
		equal(bulkRow.ltz_value, "2025-01-02T08:34:05.987654321", "bulk TIMESTAMP LOCAL TZ value");
	},
);

await run(
	"composite primary key deletes are refused before writes",
	async () => {
		await dropTable("oracle_review_composite_pk");
		await query(`CREATE TABLE "oracle_review_composite_pk" (
			"a" NUMBER,
			"b" NUMBER,
			"label" VARCHAR2(40),
			PRIMARY KEY ("a", "b")
		)`);
		await query(`INSERT ALL
			INTO "oracle_review_composite_pk" VALUES (1, 1, 'first')
			INTO "oracle_review_composite_pk" VALUES (1, 2, 'second')
		SELECT 1 FROM dual`);
		const body = {
			tableName: "oracle_review_composite_pk",
			primaryKeys: [{ columnName: "a", value: 1 }],
		};
		const normal = await api("DELETE", "/oracle/records", body, 400);
		const forced = await api("DELETE", "/oracle/records/force", body, 400);
		const rows = rowsOf(
			await query('SELECT "a", "b", "label" FROM "oracle_review_composite_pk" ORDER BY "b"'),
		);
		return { normal, forced, rows };
	},
	({ rows }) =>
		equal(
			rows.map((row) => row.label),
			["first", "second"],
			"remaining rows",
		),
);

for (const table of [
	"oracle_review_child",
	"oracle_review_parent",
	"oracle_review_timestamp",
	"oracle_review_temporal",
	"oracle_review_composite_pk",
]) {
	await dropTable(table).catch(() => {});
}

const artifact = {
	engine: "oracle",
	scenarios,
};
const secrets = [
	databaseUrl,
	databaseUrl.replace(/^[a-z0-9+]+:\/\//i, ""),
	`${parsedDatabaseUrl.host}${parsedDatabaseUrl.pathname}`,
	parsedDatabaseUrl.host,
	process.cwd(),
];
const normalize = (value: unknown, key?: string): unknown => {
	if (key === "duration" || key === "queryTime") return `<${key}>`;
	if (Array.isArray(value)) return value.map((item) => normalize(item));
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([entryKey, entryValue]) => [entryKey, normalize(entryValue, entryKey)]),
		);
	if (typeof value === "string") {
		const redacted = secrets.reduce(
			(text, secret) => text.replaceAll(secret, "<redacted>"),
			value,
		);
		return redacted.replace(/[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi, "<redacted-url>");
	}
	return value;
};
const outputDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".e2e-output");
await mkdir(outputDir, { recursive: true });
await writeFile(
	path.join(outputDir, "oracle-review.json"),
	`${JSON.stringify(normalize(artifact), null, 2)}\n`,
);

const failed = scenarios.filter((scenario) => !scenario.ok).length;
console.log(
	`${failed ? "FAIL" : "PASS"}  ${scenarios.length - failed}/${scenarios.length} scenarios`,
);
process.exit(failed ? 1 : 0);
