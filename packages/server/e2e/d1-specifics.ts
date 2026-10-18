import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULTS } from "@db-studio/shared/constants";

process.env.DB_STUDIO_TELEMETRY = "0";

const PARENT = "dbstudio_d1_parent";
const CHILD = "dbstudio_d1_child";

const label = process.argv[2];
const databaseUrl = process.env.DATABASE_URL;
if (!label || !databaseUrl) {
	console.error(
		"usage: DATABASE_URL=<sqlite:// or d1:// url> bunx tsx e2e/d1-specifics.ts <label>",
	);
	process.exit(2);
}
const isD1 = databaseUrl.startsWith("d1://");

const { createServer } = await import("../src/utils/create-server.js");
const { app } = createServer();

const current = await app.handle(
	new Request(new URL(`${DEFAULTS.API_PREFIX}/databases/current`, "http://localhost")),
);
const { db } = ((await current.json()) as { data: { db: string } }).data;

const call = async (method: string, route: string, body?: unknown) => {
	const url = new URL(`${DEFAULTS.API_PREFIX}/sqlite${route}`, "http://localhost");
	url.searchParams.set("db", db);
	const res = await app.handle(
		new Request(url, {
			method,
			headers: body === undefined ? {} : { "Content-Type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
		}),
	);
	return {
		status: res.status,
		body: (await res.json()) as { data?: unknown; error?: string },
	};
};

const sql = async (query: string) => {
	const res = await call("POST", "/query", { query });
	if (res.status !== 200)
		throw new Error(`${query}: ${res.status} ${JSON.stringify(res.body)}`);
	return (res.body.data as { rows: Record<string, unknown>[] }).rows;
};

const results: { check: string; ok: boolean; observed: unknown }[] = [];
const check = (name: string, ok: boolean, observed: unknown) => {
	results.push({ check: name, ok, observed });
	console.log(
		`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : ` -> ${JSON.stringify(observed)}`}`,
	);
};

await sql(`DROP TABLE IF EXISTS ${CHILD}`);
await sql(`DROP TABLE IF EXISTS ${PARENT}`);
await sql(`CREATE TABLE ${PARENT} (id INTEGER PRIMARY KEY, name TEXT, data BLOB)`);
await sql(
	`CREATE TABLE ${CHILD} (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES ${PARENT}(id) ON DELETE CASCADE)`,
);
await sql(`INSERT INTO ${PARENT} VALUES (1, 'a', X'DEADBEEF'), (2, 'b', NULL)`);
await sql(`INSERT INTO ${CHILD} VALUES (10, 1)`);

const update = await call("PATCH", "/records", {
	tableName: PARENT,
	primaryKey: "id",
	updates: [
		{ rowData: { id: 1 }, columnName: "name", value: "changed" },
		{ rowData: { id: 999 }, columnName: "name", value: "ghost" },
	],
});
check("update with one missing key answers 404", update.status === 404, update);
const [afterUpdate] = await sql(`SELECT name FROM ${PARENT} WHERE id = 1`);
check("the update that matched was rolled back", afterUpdate?.name === "a", afterUpdate);

const alter = await call("PATCH", `/tables/${PARENT}/columns/name`, {
	columnType: "TEXT",
	isNullable: false,
	defaultValue: "'x'",
});
check(
	isD1
		? "altering a referenced table is refused with 400"
		: "altering a referenced table succeeds",
	alter.status === (isD1 ? 400 : 200),
	alter,
);
const [children] = await sql(`SELECT COUNT(*) AS n FROM ${CHILD}`);
check("child rows survive the alter attempt", children?.n === 1, children);

const tables = await call("GET", "/tables");
const names = (tables.body.data as { tableName: string }[]).map((t) => t.tableName);
check(
	"internal _cf_ tables are hidden and ours are listed",
	!names.some((n) => n.startsWith("_cf_")) && names.includes(PARENT) && names.includes(CHILD),
	names.filter((n) => n.startsWith("_cf_") || n.startsWith("dbstudio_d1_")),
);

const [blob] = await sql(`SELECT data, hex(data) AS hex FROM ${PARENT} WHERE id = 1`);
check("blob round-trips byte for byte", blob?.hex === "DEADBEEF", blob);

await sql(`DROP TABLE ${CHILD}`);
await sql(`DROP TABLE ${PARENT}`);

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "artifacts");
await mkdir(out, { recursive: true });
const artifact = results.map(({ check, ok, observed }) => ({
	check,
	ok,
	observed: JSON.parse(
		JSON.stringify(observed).replace(/"requestId":"[^"]*"/g, '"requestId":"<requestId>"'),
	),
}));
await writeFile(
	path.join(out, `d1-specifics-${label}.json`),
	`${JSON.stringify(artifact, null, "\t")}\n`,
);
const failed = results.filter((r) => !r.ok).length;
console.log(
	`${failed ? "FAIL" : "PASS"}  ${results.length - failed}/${results.length} checks`,
);
process.exit(failed ? 1 : 0);
