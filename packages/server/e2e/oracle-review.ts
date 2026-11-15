import {
	assert,
	assertEqual,
	checks,
	inProcessApp,
	normalize,
	redactUrl,
	requireDatabaseUrl,
	writeArtifact,
} from "./lib.js";

process.env.TZ = "UTC";

type Method = "GET" | "POST" | "PATCH" | "DELETE";

type Row = Record<string, unknown>;

type Scenario = { name: string; ok: boolean; evidence: unknown; error?: string };

const { url: databaseUrl } = requireDatabaseUrl("oracle");
const parsedDatabaseUrl = new URL(databaseUrl);
const app = await inProcessApp(databaseUrl);
const scenarios: Scenario[] = [];
const { report, finish } = checks();

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

const api = async (
	method: Method,
	route: string,
	body?: unknown,
	expected: number | number[] = 200,
) => {
	const response = await app.call(method, route, body);
	const accepted = Array.isArray(expected) ? expected : [expected];
	assert(
		accepted.includes(response.status),
		`${method} ${route} returned ${response.status}: ${JSON.stringify(response.body).slice(0, 300)}`,
	);

	return response.body;
};

const query = (sql: string, expected: number | number[] = 200) =>
	api("POST", "/query", { query: sql }, expected);

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
		scenarios.push({ name, ok: report(name), evidence });
	} catch (cause) {
		const error = cause instanceof Error ? cause.message : String(cause);
		scenarios.push({ name, ok: report(name, error), evidence, error });
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
			"/records",
			{ tableName: "oracle_review_parent", primaryKeys: [{ columnName: "id", value: 1 }] },
			409,
		);

		const forced = await api("DELETE", "/records/force", {
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
		assertEqual(related.length, 1, "related constraint count");
		assertEqual(recordOf(related[0]).columnName, "a, b", "related columns");
		assertEqual(
			(recordOf(related[0]).records as Row[]).map((row) => row.id),
			[11],
			"related child ids",
		);
		assertEqual(recordOf(forced).deletedCount, 2, "force deleted count");
		assertEqual(
			parents.map((row) => row.id),
			[2],
			"remaining parent ids",
		);
		assertEqual(
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
				await api("GET", "/tables/oracle_review_timestamp/data?limit=10&sort=label&order=asc"),
			),
		).data as Row[];

		const target = tableBefore.find((row) => row.label === "target");
		assert(target, "target row missing from table data");
		await api("PATCH", "/records", {
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
		assertEqual(
			recordOf(nativeQuery).error,
			"Oracle query results with native DATE or TIMESTAMP columns must use TO_CHAR with an explicit format so fractional seconds are not lost.",
			"native temporal query limitation",
		);
		assertEqual(
			queryBefore.map((row) => row.stamp).sort(),
			expectedStamps,
			"query runner timestamps",
		);
		assertEqual(
			tableBefore.map((row) => row.stamp).sort(),
			expectedStamps,
			"table timestamps",
		);
		assertEqual(
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
		await api("POST", "/records/bulk", {
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
		await api("PATCH", "/records", {
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
		assertEqual(row.date_value, "2026-10-07T12:34:56", "DATE value");
		assertEqual(row.timestamp_value, "2026-10-07T12:34:56.123456789", "TIMESTAMP value");
		assertEqual(row.tz_value, "2026-10-07T12:34:56.123456789+03:00", "TIMESTAMP TZ value");
		assertEqual(
			row.ltz_value,
			"2026-10-07T09:34:56.123456789",
			"TIMESTAMP LOCAL TZ value in UTC session",
		);
		assertEqual(bulkRow.date_value, "2025-01-02T03:04:05", "bulk DATE value");
		assertEqual(
			bulkRow.timestamp_value,
			"2025-01-02T03:04:05.987654321",
			"bulk TIMESTAMP value",
		);
		assertEqual(
			bulkRow.tz_value,
			"2025-01-02T03:04:05.987654321-05:30",
			"bulk TIMESTAMP TZ value",
		);
		assertEqual(
			bulkRow.ltz_value,
			"2025-01-02T08:34:05.987654321",
			"bulk TIMESTAMP LOCAL TZ value",
		);
	},
);

await run(
	"mixed-offset timestamps sort by instant and accept canonical patterns",
	async () => {
		await dropTable("oracle_review_tz_sort");
		await query(`CREATE TABLE "oracle_review_tz_sort" (
			"id" NUMBER PRIMARY KEY,
			"zoned_at" TIMESTAMP(9) WITH TIME ZONE
		)`);
		await query(`INSERT ALL
			INTO "oracle_review_tz_sort" VALUES (
				1,
				TO_TIMESTAMP_TZ(
					'2026-01-01T01:00:00.000000000+05:00',
					'YYYY-MM-DD"T"HH24:MI:SS.FF9TZH:TZM'
				)
			)
			INTO "oracle_review_tz_sort" VALUES (
				2,
				TO_TIMESTAMP_TZ(
					'2026-01-01T00:30:00.000000000+00:00',
					'YYYY-MM-DD"T"HH24:MI:SS.FF9TZH:TZM'
				)
			)
		SELECT 1 FROM dual`);

		const sortQuery = new URLSearchParams({
			limit: "10",
			sort: "zoned_at",
			order: "asc",
		});

		const sorted = recordOf(
			dataOf(await api("GET", `/tables/oracle_review_tz_sort/data?${sortQuery}`)),
		).data as Row[];

		const filterQuery = new URLSearchParams({
			limit: "10",
			filters: JSON.stringify([
				{
					columnName: "zoned_at",
					operator: "like",
					value: "2026-01-01T01:%+05:00",
				},
			]),
		});

		const filtered = recordOf(
			dataOf(await api("GET", `/tables/oracle_review_tz_sort/data?${filterQuery}`)),
		).data as Row[];

		return { sorted, filtered };
	},
	({ sorted, filtered }) => {
		assertEqual(
			sorted.map((row) => [row.id, row.zoned_at]),
			[
				[1, "2026-01-01T01:00:00.000000000+05:00"],
				[2, "2026-01-01T00:30:00.000000000+00:00"],
			],
			"mixed-offset instant order",
		);
		assertEqual(
			filtered.map((row) => row.id),
			[1],
			"temporal LIKE row ids",
		);
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

		const normal = await api("DELETE", "/records", body, 400);
		const forced = await api("DELETE", "/records/force", body, 400);

		const rows = rowsOf(
			await query('SELECT "a", "b", "label" FROM "oracle_review_composite_pk" ORDER BY "b"'),
		);

		return { normal, forced, rows };
	},
	({ rows }) =>
		assertEqual(
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
	"oracle_review_tz_sort",
	"oracle_review_composite_pk",
]) {
	await dropTable(table).catch(() => {});
}

const artifact = {
	engine: "oracle",
	scenarios,
};

const artifactPath = await writeArtifact(
	"oracle-review.json",
	normalize(artifact, {
		keys: ["duration", "queryTime", "requestId"],
		replace: [
			...redactUrl(databaseUrl),
			[`${parsedDatabaseUrl.host}${parsedDatabaseUrl.pathname}`, "<redacted>"],
			[parsedDatabaseUrl.host, "<redacted>"],
			[process.cwd(), "<redacted>"],
			[/[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi, "<redacted-url>"],
		],
	}),
);

await app.close();

finish(artifactPath);
