import { isDeepStrictEqual } from "node:util";
import { checks, inProcessApp, normalize, writeArtifact } from "./lib.js";

const PARENT = "dbstudio_d1_Parent";
const CHILD = "dbstudio_d1_child";
const SELF = "dbstudio_d1_Self";

const label = process.argv[2];
const databaseUrl = process.env.DATABASE_URL;

if (!label || !databaseUrl) {
	console.error(
		"usage: DATABASE_URL=<sqlite:// or d1:// url> bunx tsx e2e/d1-specifics.ts <label>",
	);
	process.exit(2);
}

const isD1 = databaseUrl.startsWith("d1://");
const { call, close, query: sql } = await inProcessApp(databaseUrl);

const results: { check: string; ok: boolean; observed: unknown }[] = [];

const { report, finish } = checks();

const check = (name: string, ok: boolean, observed: unknown) => {
	results.push({ check: name, ok, observed });
	report(name, ok ? undefined : JSON.stringify(observed));
};

await sql(`DROP TABLE IF EXISTS ${CHILD}`);

await sql(`DROP TABLE IF EXISTS ${PARENT}`);

await sql(`CREATE TABLE ${PARENT} (id INTEGER PRIMARY KEY, name TEXT, data BLOB)`);

await sql(
	`CREATE TABLE ${CHILD} (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES ${PARENT.toLowerCase()}(id) ON DELETE CASCADE)`,
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
		? "altering a table referenced with different casing is refused with 400"
		: "altering a referenced table succeeds",
	alter.status === (isD1 ? 400 : 200),
	alter,
);

const children = await sql(`SELECT id, parent_id FROM ${CHILD} ORDER BY id`);

check(
	"child rows survive the alter attempt",
	isDeepStrictEqual(children, [{ id: 10, parent_id: 1 }]),
	children,
);

const tables = await call("GET", "/tables");
const names = (tables.body as { data: { tableName: string }[] }).data.map((t) => t.tableName);

check(
	"internal _cf_ tables are hidden and ours are listed",
	!names.some((n) => n.startsWith("_cf_")) && names.includes(PARENT) && names.includes(CHILD),
	names.filter((n) => n.startsWith("_cf_") || n.startsWith("dbstudio_d1_")),
);

const [blob] = await sql(`SELECT data, hex(data) AS hex FROM ${PARENT} WHERE id = 1`);

check(
	"blob round-trips byte for byte",
	blob?.hex === "DEADBEEF" &&
		isDeepStrictEqual(blob.data, { type: "Buffer", data: [222, 173, 190, 239] }),
	blob,
);

for (const reference of [SELF, SELF.toLowerCase()]) {
	await sql(`DROP TABLE IF EXISTS ${SELF}`);
	await sql(
		`CREATE TABLE ${SELF} (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES ${reference}(id) ON DELETE CASCADE, name TEXT)`,
	);
	await sql(`INSERT INTO ${SELF} VALUES (1, NULL, 'root'), (2, 1, 'child')`);

	const selfAlter = await call("PATCH", `/tables/${SELF}/columns/name`, {
		columnType: "TEXT",
		isNullable: false,
		defaultValue: "'x'",
	});

	check(
		`altering a self-referencing table via ${reference} ${isD1 ? "is refused with 400" : "succeeds"}`,
		selfAlter.status === (isD1 ? 400 : 200),
		selfAlter,
	);
	const selfRows = await sql(`SELECT id, parent_id, name FROM ${SELF} ORDER BY id`);
	check(
		`self-referencing rows via ${reference} survive the alter attempt`,
		isDeepStrictEqual(selfRows, [
			{ id: 1, parent_id: null, name: "root" },
			{ id: 2, parent_id: 1, name: "child" },
		]),
		selfRows,
	);
	await sql(`DROP TABLE ${SELF}`);
}

await sql(`DROP TABLE ${CHILD}`);

await sql(`DROP TABLE ${PARENT}`);

const artifactPath = await writeArtifact(
	`d1-specifics-${label}.json`,
	normalize(results, { keys: ["requestId"] }),
);

await close();

finish(artifactPath);
