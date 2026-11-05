/**
 * Two PostgreSQL tables that share a name in different schemas, opened and edited through a
 * production build. Runs against the seeded PostgreSQL database (`bun run init-db:pgsql`), adds
 * `public.e2e_same_name` and `hr.e2e_same_name` for the run and drops them afterwards.
 *
 * Failure modes it covers:
 * - opening `hr.e2e_same_name` from the sidebar or the visualizer shows `public`'s rows, because
 *   the bare name resolves through search_path;
 * - the Schema and Indexes tabs show the other table's columns and indexes;
 * - switching tabs or following a sidebar link drops the schema;
 * - inserting, updating, deleting or exporting rows of one table touches the other;
 * - both same-named sidebar entries highlight at once.
 *
 *   DATABASE_URL=postgresql://dbstudio:dbstudio@127.0.0.1:5434/dbstudio \
 *     bun run --cwd packages/server e2e:schema-routing [build]
 *
 * [build] names a snapshot in e2e/artifacts/builds/ and defaults to dist/. Screenshots and a
 * JSON summary go to e2e/artifacts/schema-routing-<build>/.
 */
import assert from "node:assert/strict";
import path from "node:path";
import pg from "pg";
import type { Page } from "playwright-core";
import {
	ARTIFACTS_DIR,
	cliPath,
	databaseName,
	launchBrowser,
	requireDatabaseUrl,
	startCli,
	writeArtifact,
} from "./lib.js";

const { url: databaseUrl } = requireDatabaseUrl("pg");
const db = databaseName(databaseUrl);
const build = process.argv[2];
const outDir = `schema-routing-${build ?? "dist"}`;
const TABLE = "e2e_same_name";

const client = new pg.Client({ connectionString: databaseUrl });

await client.connect();

const dropTables = () => client.query(`DROP TABLE IF EXISTS public.${TABLE}, hr.${TABLE}`);

await dropTables();

// `public` is first on the search path, so a bare name always resolves to it.
await client.query(`
	CREATE TABLE public.${TABLE} (id int PRIMARY KEY, origin text NOT NULL);
	INSERT INTO public.${TABLE} VALUES (1, 'from-public');
	CREATE TABLE hr.${TABLE} (id int PRIMARY KEY, origin text NOT NULL, hr_only text);
	CREATE INDEX e2e_same_name_hr_origin ON hr.${TABLE} (origin);
	INSERT INTO hr.${TABLE} VALUES (1, 'from-hr', 'x');
`);

const rowsOf = async (schema: string) =>
	(await client.query(`SELECT id, origin FROM ${schema}.${TABLE} ORDER BY id`)).rows;

const { child: server, base: BASE } = await startCli({
	cli: cliPath(build),
	args: ["-d", databaseUrl],
});

const API = `${BASE}/api/pg`;

const api = async (method: string, path: string, schemaName: string, body?: unknown) => {
	const url = new URL(`${API}${path}`);
	url.searchParams.set("db", db);
	url.searchParams.set("schemaName", schemaName);

	const response = await fetch(url, {
		method,
		headers: body ? { "content-type": "application/json" } : undefined,
		body: body ? JSON.stringify(body) : undefined,
	});

	assert.equal(response.ok, true, `${method} ${path} answered ${response.status}`);

	return response;
};

/** The grid's `origin` cells and the URL's path and schema. */
const gridState = async (page: Page) => {
	const url = new URL(page.url());
	await page
		.getByText(/^from-/)
		.first()
		.waitFor();

	return {
		path: url.pathname,
		tableSchema: url.searchParams.get("tableSchema"),
		origins: await page.getByText(/^from-/).allTextContents(),
	};
};

const activeSidebarEntries = (page: Page) =>
	page.evaluate(() =>
		[...document.querySelectorAll("li")].flatMap((li) =>
			li.querySelector(".bg-primary")
				? [li.querySelector("a")?.textContent?.trim() ?? ""]
				: [],
		),
	);

const summary: Record<string, unknown> = {};

const shot = (page: Page, name: string) =>
	page.screenshot({ path: path.join(ARTIFACTS_DIR, outDir, `${name}.png`) });

const browser = await launchBrowser();

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
	const pageErrors: string[] = [];
	page.on("pageerror", (error) => pageErrors.push(error.message));

	// The sidebar opens the hr table, not the public one search_path picks.
	await page.goto(`${BASE}/table`);
	await page.getByRole("link", { name: `hr.${TABLE}`, exact: true }).click();
	summary.sidebarHr = await gridState(page);
	assert.deepEqual(summary.sidebarHr, {
		path: `/table/${TABLE}`,
		tableSchema: "hr",
		origins: ["from-hr"],
	});
	summary.sidebarHrActive = await activeSidebarEntries(page);
	assert.deepEqual(summary.sidebarHrActive, [`hr.${TABLE}`]);
	await shot(page, "1-sidebar-hr");

	await page.getByRole("link", { name: TABLE, exact: true }).click();
	await page.getByText("from-public").waitFor();
	summary.sidebarPublic = await gridState(page);
	assert.deepEqual(summary.sidebarPublic, {
		path: `/table/${TABLE}`,
		tableSchema: "public",
		origins: ["from-public"],
	});
	await shot(page, "2-sidebar-public");

	// The visualizer opens the double-clicked table.
	await page.goto(`${BASE}/visualizer`);
	await page.locator(`.react-flow__node[data-id="hr.${TABLE}"]`).dblclick();
	await page.waitForURL(new RegExp(`/table/${TABLE}`));
	summary.visualizerHr = await gridState(page);
	assert.deepEqual(summary.visualizerHr, {
		path: `/table/${TABLE}`,
		tableSchema: "hr",
		origins: ["from-hr"],
	});

	// The Schema and Indexes tabs keep the schema and show the hr table's own columns and index.
	await page.getByRole("button", { name: "schema", exact: true }).click();
	await page.getByText("hr_only").first().waitFor();
	summary.schemaTab = {
		tableSchema: new URL(page.url()).searchParams.get("tableSchema"),
		hasHrOnlyColumn: (await page.getByText("hr_only").count()) > 0,
	};
	assert.deepEqual(summary.schemaTab, { tableSchema: "hr", hasHrOnlyColumn: true });
	await shot(page, "3-schema-tab-hr");

	await page.getByRole("button", { name: "indexes", exact: true }).click();
	await page.getByText("e2e_same_name_hr_origin").waitFor();
	summary.indexesTab = {
		tableSchema: new URL(page.url()).searchParams.get("tableSchema"),
		hasHrIndex: (await page.getByText("e2e_same_name_hr_origin").count()) > 0,
	};
	assert.deepEqual(summary.indexesTab, { tableSchema: "hr", hasHrIndex: true });
	await shot(page, "4-indexes-tab-hr");

	// Every table route reaches only the named schema's table.
	const columns = await (await api("GET", `/tables/${TABLE}/columns`, "hr")).json();
	await api("POST", "/records", "hr", {
		tableName: TABLE,
		data: { id: 2, origin: "from-hr" },
	});
	await api("PATCH", "/records", "hr", {
		tableName: TABLE,
		primaryKey: "id",
		updates: [{ rowData: { id: 2 }, columnName: "origin", value: "from-hr-edited" }],
	});
	await api("POST", "/records/bulk", "hr", {
		tableName: TABLE,
		records: [{ id: 3, origin: "from-hr" }],
	});
	await api("DELETE", "/records", "hr", {
		tableName: TABLE,
		primaryKeys: [{ columnName: "id", value: 3 }],
	});

	const exported = await (
		await api("GET", `/tables/${TABLE}/export?format=json`, "hr")
	).text();

	summary.api = {
		hrColumns: columns.data.map((column: { columnName: string }) => column.columnName),
		hrRows: await rowsOf("hr"),
		publicRows: await rowsOf("public"),
		exportedHrRows: JSON.parse(exported),
	};
	assert.deepEqual(summary.api, {
		hrColumns: ["id", "origin", "hr_only"],
		hrRows: [
			{ id: 1, origin: "from-hr" },
			{ id: 2, origin: "from-hr-edited" },
		],
		publicRows: [{ id: 1, origin: "from-public" }],
		exportedHrRows: [
			{ id: 1, origin: "from-hr", hr_only: "x" },
			{ id: 2, origin: "from-hr-edited", hr_only: null },
		],
	});

	summary.pageErrors = pageErrors;
	assert.deepEqual(pageErrors, []);
	console.log("PASS schema-routing", JSON.stringify(summary));
} catch (error) {
	await shot(page, "failure");
	throw error;
} finally {
	await writeArtifact(`${outDir}/summary.json`, summary);
	await browser.close();
	server.kill("SIGKILL");
	await dropTables();
	await client.end();
}
