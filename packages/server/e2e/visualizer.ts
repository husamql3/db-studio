/**
 * The schema visualizer against a production build and the seeded PostgreSQL database
 * (`bun run init-db:pgsql`: 8 tables in the analytics, hr and public schemas, 4 foreign keys).
 *
 * Failure modes it covers:
 * - a table is missing from the canvas, or a foreign key draws no edge (an edge whose handle
 *   id does not match a column row is silently dropped by React Flow);
 * - an FK resolves to a same-named table in another schema;
 * - picking a table in the sidebar does not select it, highlight its edges, or pan to it;
 * - clicking a table on the canvas pans the view away from where the user clicked;
 * - the schema selector does not narrow the diagram, or keeps edges into hidden tables;
 * - double-clicking a table does not open its data.
 *
 *   DATABASE_URL=postgresql://dbstudio:dbstudio@127.0.0.1:5434/dbstudio \
 *     bun run --cwd packages/server e2e:visualizer [build]
 *
 * [build] names a snapshot in e2e/artifacts/builds/ and defaults to dist/. Nothing is written to
 * the database. Screenshots and a JSON summary go to e2e/artifacts/visualizer-<build>/.
 */
import assert from "node:assert/strict";
import path from "node:path";
import type { Page } from "playwright-core";
import {
	ARTIFACTS_DIR,
	cliPath,
	launchBrowser,
	requireDatabaseUrl,
	startCli,
	writeArtifact,
} from "./lib.js";

const { url: databaseUrl } = requireDatabaseUrl("pg");
const build = process.argv[2];
const outDir = `visualizer-${build ?? "dist"}`;

const { child: server, base: BASE } = await startCli({
	cli: cliPath(build),
	args: ["-d", databaseUrl],
});

/** What the canvas shows: table ids, edges, and the selected and dimmed tables. */
const canvasState = (page: Page) =>
	// No named helpers inside: tsx wraps them in a `__name()` call the page does not define.
	page.evaluate(() => {
		const nodes = [...document.querySelectorAll<HTMLElement>(".react-flow__node")];
		const edges = [...document.querySelectorAll<SVGElement>(".react-flow__edge")];

		return {
			tables: nodes.map((node) => node.dataset.id).sort(),
			edges: edges.map((edge) => edge.dataset.id).sort(),
			highlightedEdges: edges
				.flatMap((edge) => (edge.classList.contains("animated") ? [edge.dataset.id] : []))
				.sort(),
			active: nodes
				.flatMap((node) => (node.querySelector("[data-active]") ? [node.dataset.id] : []))
				.sort(),
			dimmed: nodes
				.flatMap((node) => (node.querySelector("[data-dimmed]") ? [node.dataset.id] : []))
				.sort(),
		};
	});

const viewport = (page: Page) =>
	page.locator(".react-flow__viewport").evaluate((el) => (el as HTMLElement).style.transform);

/** Distance in pixels between a table's centre and the canvas centre. */
const offCentre = (page: Page, id: string) =>
	page.evaluate((id) => {
		const node = document
			.querySelector(`.react-flow__node[data-id="${id}"]`)
			?.getBoundingClientRect();

		const pane = document.querySelector(".react-flow")?.getBoundingClientRect();

		if (!node || !pane) return Number.POSITIVE_INFINITY;

		return Math.round(
			Math.hypot(
				node.x + node.width / 2 - (pane.x + pane.width / 2),
				node.y + node.height / 2 - (pane.y + pane.height / 2),
			),
		);
	}, id);

const ALL_EDGES = [
	"hr.employees.department_id->hr.departments",
	"hr.time_off_requests.employee_id->hr.employees",
	"public.contributions.contributor_id->public.contributors",
	"public.contributions.project_id->public.projects",
];

const summary: Record<string, unknown> = {};

const shot = (page: Page, name: string) =>
	page.screenshot({ path: path.join(ARTIFACTS_DIR, outDir, `${name}.png`) });

const browser = await launchBrowser();

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
	const pageErrors: string[] = [];
	page.on("pageerror", (error) => pageErrors.push(error.message));

	// Every table and every foreign key is drawn.
	await page.goto(`${BASE}/visualizer`);
	await page.waitForFunction(
		() => document.querySelectorAll(".react-flow__edge").length === 4,
	);
	summary.allSchemas = await canvasState(page);
	assert.deepEqual(summary.allSchemas, {
		tables: [
			"analytics.daily_summaries",
			"analytics.events",
			"hr.departments",
			"hr.employees",
			"hr.time_off_requests",
			"public.contributions",
			"public.contributors",
			"public.projects",
		],
		edges: ALL_EDGES,
		highlightedEdges: [],
		active: [],
		dimmed: [],
	});
	await shot(page, "1-all-schemas");

	// Picking a table in the sidebar selects it, highlights its edges and pans to it.
	await page.getByRole("button", { name: "hr.employees" }).click();
	await page.waitForFunction(() =>
		document.querySelector('.react-flow__node[data-id="hr.employees"] [data-active]'),
	);
	await page.waitForTimeout(600); // the pan animates for 400 ms
	summary.sidebarPick = {
		url: new URL(page.url()).search,
		...(await canvasState(page)),
		offCentre: await offCentre(page, "hr.employees"),
	};
	assert.deepEqual(summary.sidebarPick, {
		url: "?table=hr.employees",
		tables: (summary.allSchemas as { tables: string[] }).tables,
		edges: ALL_EDGES,
		highlightedEdges: ALL_EDGES.slice(0, 2),
		active: ["hr.employees"],
		dimmed: [
			"analytics.daily_summaries",
			"analytics.events",
			"public.contributions",
			"public.contributors",
			"public.projects",
		],
		offCentre: 0,
	});
	await shot(page, "2-sidebar-pick-employees");

	// Clicking a table on the canvas selects it without moving the view.
	const before = await viewport(page);
	await page.locator('.react-flow__node[data-id="hr.departments"]').click();
	await page.waitForFunction(() =>
		document.querySelector('.react-flow__node[data-id="hr.departments"] [data-active]'),
	);
	await page.waitForTimeout(600);
	summary.canvasClick = {
		url: new URL(page.url()).search,
		moved: (await viewport(page)) !== before,
		active: (await canvasState(page)).active,
	};
	assert.deepEqual(summary.canvasClick, {
		url: "?table=hr.departments",
		moved: false,
		active: ["hr.departments"],
	});
	await shot(page, "3-canvas-click-departments");

	// The schema selector narrows the diagram and drops edges into the hidden schemas.
	await page.getByRole("combobox").filter({ hasText: "All schemas" }).click();
	await page.getByRole("option", { name: "hr", exact: true }).click();
	await page.waitForFunction(
		() => document.querySelectorAll(".react-flow__node").length === 3,
	);
	const hr = await canvasState(page);
	summary.hrSchema = { tables: hr.tables, edges: hr.edges };
	assert.deepEqual(summary.hrSchema, {
		tables: ["hr.departments", "hr.employees", "hr.time_off_requests"],
		edges: ALL_EDGES.slice(0, 2),
	});
	await shot(page, "4-hr-schema");

	// Double-clicking a table opens its data.
	await page.locator('.react-flow__node[data-id="hr.employees"]').dblclick();
	await page.waitForURL(/\/table\/employees/);
	summary.doubleClick = { path: new URL(page.url()).pathname };
	assert.deepEqual(summary.doubleClick, { path: "/table/employees" });

	summary.pageErrors = pageErrors;
	assert.deepEqual(pageErrors, []);
	console.log("PASS visualizer", JSON.stringify(summary));
} catch (error) {
	await shot(page, "failure");
	throw error;
} finally {
	await writeArtifact(`${outDir}/summary.json`, summary);
	await browser.close();
	server.kill("SIGKILL");
}
