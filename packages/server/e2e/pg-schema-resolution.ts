/**
 * PostgreSQL resolves a table named without a schema through the search path, which the server
 * widens to `public` followed by every other user schema. This runs the routes that take a bare
 * table name against a real database.
 *
 * Failure modes it covers:
 * - a table that lives only outside `public` lists in the sidebar but 404s on its columns;
 * - a name in `public` and another schema returns both tables' columns, or the other one's;
 * - adding a column is refused because a same-named table in another schema already has it;
 * - a rename alters the wrong schema's table, or misses a table outside `public`;
 * - a rename aimed at a schema without the table or onto a taken name does not answer 404 and
 *   409, or a bare name in two non-public schemas is not renamed in the one the search path
 *   finds first, as every other route resolves it;
 * - a double quote in a table name breaks the rename statement.
 *
 *   DATABASE_URL=postgresql://dbstudio:dbstudio@127.0.0.1:5434/dbstudio \
 *     bunx tsx e2e/pg-schema-resolution.ts
 *
 * Creates schemas `e2e_res_a`, `e2e_res_b` and `e2e_res_*` tables in `public`, drops them
 * afterwards, and writes e2e/artifacts/pg-schema-resolution.json.
 */
import { columnInfoSchema } from "@db-studio/shared/types";
import pg from "pg";
import { z } from "zod";
import {
	type ApiResponse,
	assertEqual,
	checks,
	inProcessApp,
	requireDatabaseUrl,
	writeArtifact,
} from "./lib.js";

const { url } = requireDatabaseUrl("pg");
const client = new pg.Client({ connectionString: url });

await client.connect();

const cleanUp = () =>
	client.query(`
		DROP SCHEMA IF EXISTS e2e_res_a, e2e_res_b CASCADE;
		DROP TABLE IF EXISTS public.e2e_res_both, public.e2e_res_pub, public.e2e_res_pub2,
			public."e2e_res_we""ird", public.e2e_res_ok;
	`);

await cleanUp();

// The schemas exist before the app connects: the server widens search_path per connection.
await client.query(`
	CREATE SCHEMA e2e_res_a;
	CREATE SCHEMA e2e_res_b;
	CREATE TABLE e2e_res_a.e2e_res_only (id int PRIMARY KEY, only_col text);
	CREATE TABLE public.e2e_res_both (id int PRIMARY KEY, pub_col text);
	CREATE TABLE e2e_res_a.e2e_res_both (id int PRIMARY KEY, a_col text);
	CREATE TABLE public.e2e_res_pub (id int PRIMARY KEY);
	CREATE TABLE public."e2e_res_we""ird" (id int PRIMARY KEY);
	CREATE TABLE e2e_res_a.e2e_res_x (id int PRIMARY KEY);
	CREATE TABLE e2e_res_a.e2e_res_y (id int PRIMARY KEY);
	CREATE TABLE e2e_res_a.e2e_res_amb (id int PRIMARY KEY);
	CREATE TABLE e2e_res_b.e2e_res_amb (id int PRIMARY KEY);
`);

const { call, close } = await inProcessApp(url);
const evidence: Record<string, { status: number; observed?: unknown }> = {};
const { report, finish } = checks();

/** Sends `request`, then checks its status and what `observe` reads back afterwards. */
const check = async <T>(
	name: string,
	request: () => Promise<ApiResponse>,
	status: number,
	observe: (response: ApiResponse) => T | Promise<T>,
	expected: T,
) => {
	try {
		const response = await request();
		const observed = await observe(response);
		evidence[name] = { status: response.status, observed };
		assertEqual(response.status, status, `status (${JSON.stringify(response.body)})`);
		assertEqual(observed, expected, "observed");
		report(name);
	} catch (error) {
		report(name, error instanceof Error ? error.message : String(error));
	}
};

const columnsOf = async (schema: string, table: string) =>
	(
		await client.query(
			"SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position",
			[schema, table],
		)
	).rows.map((row) => row.column_name);

const schemasOf = async (table: string) =>
	(
		await client.query(
			"SELECT table_schema FROM information_schema.tables WHERE table_name = $1 ORDER BY 1",
			[table],
		)
	).rows.map((row) => row.table_schema);

const rename = (table: string, newTableName: string, schemaName?: string) =>
	call(
		"PATCH",
		`/tables/${encodeURIComponent(table)}/rename${schemaName ? `?schemaName=${schemaName}` : ""}`,
		{ newTableName },
	);

const columnsSchema = z.object({ data: z.array(columnInfoSchema) });

const columnNames = ({ body }: ApiResponse) =>
	columnsSchema.parse(body).data.map((column) => column.columnName);

await check(
	"a table only outside public opens by its bare name",
	() => call("GET", "/tables/e2e_res_only/columns"),
	200,
	columnNames,
	["id", "only_col"],
);

await check(
	"a name in public and another schema shows public's columns once",
	() => call("GET", "/tables/e2e_res_both/columns"),
	200,
	columnNames,
	["id", "pub_col"],
);

await check(
	"adding a column only the other schema's table has adds it to public's",
	() =>
		call("POST", "/tables/e2e_res_both/columns", {
			columnName: "a_col",
			columnType: "text",
			isNullable: true,
		}),
	200,
	async () => ({
		public: await columnsOf("public", "e2e_res_both"),
		e2e_res_a: await columnsOf("e2e_res_a", "e2e_res_both"),
	}),
	{ public: ["id", "pub_col", "a_col"], e2e_res_a: ["id", "a_col"] },
);

await check(
	"renaming a public table renames it in public",
	() => rename("e2e_res_pub", "e2e_res_pub2"),
	200,
	() => schemasOf("e2e_res_pub2"),
	["public"],
);

await check(
	"renaming a table only outside public renames it in its schema",
	() => rename("e2e_res_only", "e2e_res_only2"),
	200,
	() => schemasOf("e2e_res_only2"),
	["e2e_res_a"],
);

await check(
	"renaming with a schema renames that schema's table of a shared name",
	() => rename("e2e_res_both", "e2e_res_both_a", "e2e_res_a"),
	200,
	async () => ({
		renamed: await schemasOf("e2e_res_both_a"),
		kept: await schemasOf("e2e_res_both"),
	}),
	{ renamed: ["e2e_res_a"], kept: ["public"] },
);

await check(
	"renaming in a schema without the table answers 404",
	() => rename("e2e_res_pub2", "e2e_res_pub3", "e2e_res_b"),
	404,
	() => schemasOf("e2e_res_pub2"),
	["public"],
);

await check(
	"a double quote in the table name is escaped",
	() => rename('e2e_res_we"ird', "e2e_res_ok"),
	200,
	() => schemasOf("e2e_res_ok"),
	["public"],
);

await check(
	"renaming onto a name taken in the same schema answers 409",
	() => rename("e2e_res_x", "e2e_res_y"),
	409,
	() => schemasOf("e2e_res_x"),
	["e2e_res_a"],
);

await check(
	"renaming a bare name in two non-public schemas renames the search path's first",
	() => rename("e2e_res_amb", "e2e_res_amb2"),
	200,
	async () => ({
		renamed: await schemasOf("e2e_res_amb2"),
		kept: await schemasOf("e2e_res_amb"),
	}),
	{ renamed: ["e2e_res_a"], kept: ["e2e_res_b"] },
);

await close();

await cleanUp();

await client.end();

finish(await writeArtifact("pg-schema-resolution.json", evidence));
