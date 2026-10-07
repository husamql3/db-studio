import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULTS } from "@db-studio/shared/constants";

process.env.TZ = "UTC";
process.env.DB_STUDIO_TELEMETRY = "0";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Method = "GET" | "POST" | "PATCH" | "DELETE";
type ApiResponse = { status: number; body: unknown };
type ProbeResult = ApiResponse & { name: string; ok: boolean; error?: string };

const PRECISION_TABLE = "dbstudio_clickhouse_precision_probe";
const MUTATION_TABLE = "dbstudio_clickhouse_mutation_probe";
const ROW_MUTATION_ERROR =
	"Use a SQL query to update or delete ClickHouse rows; sorting keys are not unique.";

const databaseUrl = process.env.DATABASE_URL;
const label = process.argv[2] ?? "current";

if (!databaseUrl) {
	console.error(
		"usage: DATABASE_URL=<url> node --import tsx e2e/clickhouse-regressions.ts <label>",
	);
	process.exit(2);
}

if (process.versions.node.split(".")[0] !== "20") {
	console.error(`Node 20 is required; received ${process.versions.node}`);
	process.exit(2);
}

const db = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
const { createServer } = await import("../src/utils/create-server.js");
const { app } = createServer();

const request = async (
	method: Method,
	route: string,
	body?: unknown,
): Promise<ApiResponse> => {
	const url = new URL(`${DEFAULTS.API_PREFIX}/clickhouse${route}`, "http://db-studio.local");
	url.searchParams.set("db", db);
	const response = await app.request(`${url.pathname}?${url.searchParams.toString()}`, {
		method,
		headers: body === undefined ? {} : { "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const text = await response.text();
	let parsed: unknown = text;
	try {
		parsed = JSON.parse(text);
	} catch {}
	return { status: response.status, body: parsed };
};

const query = (sql: string) => request("POST", "/query", { query: sql });

const asRecord = (value: unknown, label: string): Record<string, unknown> => {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} is not an object`);
	}
	return value as Record<string, unknown>;
};

const assert = (condition: unknown, message: string): asserts condition => {
	if (!condition) throw new Error(message);
};

const assertEqual = (actual: unknown, expected: unknown, message: string) => {
	const received = JSON.stringify(actual);
	const wanted = JSON.stringify(expected);
	assert(received === wanted, `${message}: expected ${wanted}, received ${received}`);
};

const assertStatus = (response: ApiResponse, expected: number) => {
	assert(
		response.status === expected,
		`expected HTTP ${expected}, received ${response.status}`,
	);
};

const errorOf = (response: ApiResponse): string => {
	const body = asRecord(response.body, "error response");
	assert(typeof body.error === "string", "error response has no error message");
	return body.error;
};

const dataOf = (response: ApiResponse): Record<string, unknown> => {
	const body = asRecord(response.body, "response");
	return asRecord(body.data, "response data");
};

const queryRowsOf = (response: ApiResponse): Array<Record<string, unknown>> => {
	const rows = dataOf(response).rows;
	assert(Array.isArray(rows), "query response has no rows");
	return rows.map((row) => asRecord(row, "query row"));
};

const tableRowsOf = (response: ApiResponse): Array<Record<string, unknown>> => {
	const rows = dataOf(response).data;
	assert(Array.isArray(rows), "table response has no rows");
	return rows.map((row) => asRecord(row, "table row"));
};

const requireOk = async (name: string, response: Promise<ApiResponse>) => {
	const observed = await response;
	assert(
		observed.status < 300,
		`${name} failed with HTTP ${observed.status}: ${JSON.stringify(observed.body)}`,
	);
};

const results: ProbeResult[] = [];

const probe = async (
	name: string,
	action: () => Promise<ApiResponse>,
	verify: (response: ApiResponse) => void,
) => {
	let observed: ApiResponse = { status: 0, body: null };
	let error: string | undefined;
	try {
		observed = await action();
		verify(observed);
	} catch (cause) {
		error = cause instanceof Error ? cause.message : String(cause);
	}
	const ok = error === undefined;
	results.push({ name, ...observed, ok, ...(error ? { error } : {}) });
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}${error ? `  -- ${error}` : ""}`);
};

const normalize = (value: unknown, secrets: string[], key?: string): Json => {
	if (value === null || value === undefined) return null;
	if (key === "duration") return "<duration>";
	if (Array.isArray(value)) return value.map((item) => normalize(item, secrets));
	if (typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([entryKey, item]) => [entryKey, normalize(item, secrets, entryKey)]),
		);
	}
	if (typeof value === "string") {
		return secrets.reduce((text, secret) => text.replaceAll(secret, "<redacted>"), value);
	}
	if (typeof value === "number" || typeof value === "boolean") return value;
	return String(value);
};

for (const table of [PRECISION_TABLE, MUTATION_TABLE]) {
	await requireOk(`drop ${table}`, query(`DROP TABLE IF EXISTS ${table}`));
}

await requireOk(
	"create precision table",
	query(`CREATE TABLE ${PRECISION_TABLE} (
		id UInt64,
		signed_value Int64,
		int128_value Int128,
		uint128_value UInt128,
		int256_value Int256,
		uint256_value UInt256,
		decimal_value Decimal(38, 9)
	) ENGINE = MergeTree ORDER BY id`),
);
await requireOk(
	"seed precision table",
	query(`INSERT INTO ${PRECISION_TABLE} VALUES
		(9007199254740992, -9007199254740993, -900719925474099312345678901234567890, 900719925474099312345678901234567890, -900719925474099312345678901234567890, 900719925474099312345678901234567890, 12345678901234567890123456789.123456789),
		(9007199254740993, -9007199254740993, -900719925474099312345678901234567890, 900719925474099312345678901234567890, -900719925474099312345678901234567890, 900719925474099312345678901234567890, 12345678901234567890123456789.123456789)`),
);

const expectedPrecisionRows = ["9007199254740992", "9007199254740993"];
const verifyPrecision = (rows: Array<Record<string, unknown>>) => {
	assertEqual(
		rows.map((row) => row.id),
		expectedPrecisionRows,
		"UInt64 ids",
	);
	const first = rows[0];
	assert(first, "precision query returned no rows");
	assertEqual(first.signed_value, "-9007199254740993", "Int64 value");
	assertEqual(first.int128_value, "-900719925474099312345678901234567890", "Int128 value");
	assertEqual(first.uint128_value, "900719925474099312345678901234567890", "UInt128 value");
	assertEqual(first.int256_value, "-900719925474099312345678901234567890", "Int256 value");
	assertEqual(first.uint256_value, "900719925474099312345678901234567890", "UInt256 value");
	assertEqual(first.decimal_value, "12345678901234567890123456789.123456789", "Decimal value");
};

await probe(
	"query runner preserves wide integers and decimals",
	() => query(`SELECT * FROM ${PRECISION_TABLE} ORDER BY id`),
	(response) => {
		assertStatus(response, 200);
		verifyPrecision(queryRowsOf(response));
	},
);

await probe(
	"table API preserves distinct UInt64 ids",
	() => request("GET", `/tables/${PRECISION_TABLE}/data?limit=10&sort=id&order=asc`),
	(response) => {
		assertStatus(response, 200);
		verifyPrecision(tableRowsOf(response));
	},
);

await requireOk(
	"create mutation table",
	query(
		`CREATE TABLE ${MUTATION_TABLE} (key UInt64, value String) ENGINE = MergeTree ORDER BY key`,
	),
);
await requireOk(
	"seed duplicate keys",
	query(`INSERT INTO ${MUTATION_TABLE} VALUES (1, 'duplicate-a'), (1, 'duplicate-b')`),
);

await probe(
	"record API insert remains available",
	() =>
		request("POST", "/records", {
			tableName: MUTATION_TABLE,
			data: { key: "2", value: "inserted" },
		}),
	(response) => assertStatus(response, 200),
);

await probe(
	"stale grid update is refused",
	() =>
		request("PATCH", "/records", {
			tableName: MUTATION_TABLE,
			primaryKey: "key",
			updates: [
				{
					rowData: { key: "999", value: "missing" },
					columnName: "value",
					value: "changed",
				},
			],
		}),
	(response) => {
		assertStatus(response, 400);
		assertEqual(errorOf(response), ROW_MUTATION_ERROR, "update error");
	},
);

await probe(
	"duplicate and stale grid delete is refused",
	() =>
		request("DELETE", "/records", {
			tableName: MUTATION_TABLE,
			primaryKeys: [
				{ columnName: "key", value: "1" },
				{ columnName: "key", value: "999" },
			],
		}),
	(response) => {
		assertStatus(response, 400);
		assertEqual(errorOf(response), ROW_MUTATION_ERROR, "delete error");
	},
);

await probe(
	"force grid delete is refused",
	() =>
		request("DELETE", "/records/force", {
			tableName: MUTATION_TABLE,
			primaryKeys: [{ columnName: "key", value: "999" }],
		}),
	(response) => {
		assertStatus(response, 400);
		assertEqual(errorOf(response), ROW_MUTATION_ERROR, "force delete error");
	},
);

await probe(
	"refused grid mutations leave rows unchanged",
	() => query(`SELECT key, value FROM ${MUTATION_TABLE} ORDER BY key, value`),
	(response) => {
		assertStatus(response, 200);
		assertEqual(
			queryRowsOf(response),
			[
				{ key: "1", value: "duplicate-a" },
				{ key: "1", value: "duplicate-b" },
				{ key: "2", value: "inserted" },
			],
			"mutation table rows",
		);
	},
);

await probe(
	"explicit SQL mutation remains available",
	() => query(`ALTER TABLE ${MUTATION_TABLE} UPDATE value = 'sql-updated' WHERE key = 2`),
	(response) => assertStatus(response, 200),
);

await probe(
	"explicit SQL mutation is visible",
	() => query(`SELECT key, value FROM ${MUTATION_TABLE} ORDER BY key, value`),
	(response) => {
		assertStatus(response, 200);
		assertEqual(
			queryRowsOf(response),
			[
				{ key: "1", value: "duplicate-a" },
				{ key: "1", value: "duplicate-b" },
				{ key: "2", value: "sql-updated" },
			],
			"rows after SQL update",
		);
	},
);

await probe(
	"late command failure reaches the API",
	() =>
		query(
			`# exercise the command path with a streaming result
			SELECT number, throwIf(number = 100000) FROM numbers(200000)
			SETTINGS http_write_exception_in_output_format = 1
			FORMAT JSON`,
		),
	(response) => {
		assertStatus(response, 500);
		assert(
			errorOf(response).includes("throwIf"),
			"late failure did not include the server error",
		);
	},
);

for (const table of [PRECISION_TABLE, MUTATION_TABLE]) {
	await requireOk(`clean up ${table}`, query(`DROP TABLE IF EXISTS ${table}`));
}

const secrets = [databaseUrl, databaseUrl.replace(/^[a-z0-9+]+:\/\//i, "")];
const artifactDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "artifacts");
const artifactPath = path.join(
	artifactDir,
	`clickhouse-regressions-${label.replace(/[^a-z0-9_-]/gi, "-")}.json`,
);
await mkdir(artifactDir, { recursive: true });
await writeFile(
	artifactPath,
	`${JSON.stringify(normalize({ engine: "clickhouse", steps: results }, secrets), null, 2)}\n`,
);

const failures = results.filter((result) => !result.ok).length;
console.log(
	`${failures ? "FAIL" : "PASS"}  ${results.length - failures}/${results.length} probes -> ${path.relative(process.cwd(), artifactPath)}`,
);
process.exit(failures ? 1 : 0);
