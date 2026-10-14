/**
 * Grid editing against a production build: cell editors mount only when a cell is first edited,
 * so this drives each editor kind and records what the user would see.
 *
 * Failure modes it covers:
 * - a text cell's popover never opens, or its saved value is lost when the popover closes;
 * - Escape on one cell discards edits pending in other cells (every cell used to listen for it);
 * - the JSON editor, now loaded on demand, never appears;
 * - the foreign-key drawer, now mounted on first open, never opens.
 *
 *   DATABASE_URL=postgresql://dbstudio:dbstudio@127.0.0.1:5434/dbstudio_perf \
 *     bun run --cwd packages/server e2e:grid-editing [build]
 *
 * [build] names a snapshot in e2e/artifacts/builds/ and defaults to dist/. The database is the
 * one e2e/perf-seed.sql creates; nothing is written to it. Screenshots and a JSON summary go to
 * e2e/artifacts/grid-editing-<build>/.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright-core";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.startsWith("postgresql://")) {
	throw new Error("Set DATABASE_URL to a PostgreSQL database seeded by e2e/perf-seed.sql");
}
const build = process.argv[2];
const cli = fileURLToPath(
	new URL(
		build ? `./artifacts/builds/${build}/index.js` : "../dist/index.js",
		import.meta.url,
	),
);
const outDir = new URL(`./artifacts/grid-editing-${build ?? "dist"}/`, import.meta.url);
const PORT = 4524;
const BASE = `http://127.0.0.1:${PORT}`;

const server = spawn("node", [cli, "--no-open", "-p", String(PORT), "-d", databaseUrl], {
	cwd: tmpdir(),
	env: { ...process.env, NODE_ENV: "production", DB_STUDIO_TELEMETRY: "0", HOST: "127.0.0.1" },
	stdio: "ignore",
});
for (;;) {
	if (server.exitCode !== null) throw new Error(`server exited with ${server.exitCode}`);
	const ready = await fetch(`${BASE}/api/databases`)
		.then((response) => response.ok)
		.catch(() => false);
	if (ready) break;
	await new Promise((resolve) => setTimeout(resolve, 50));
}

/** The grid cell wrapper for a column of the first row, found through the header position. */
const cellSelector = async (page: Page, column: string) => {
	// Columns are virtualized, so after a horizontal scroll the header may not be rendered yet.
	const index = await page
		.waitForFunction(
			(column) => {
				const found = [...document.querySelectorAll("thead tr th")].findIndex((th) =>
					th.textContent?.trim().startsWith(column),
				);
				return found >= 0 ? found : false;
			},
			column,
			{ timeout: 5_000 },
		)
		.then((handle) => handle.jsonValue());
	return `tbody tr[data-index="0"] td:nth-child(${index + 1}) > [role="button"]`;
};

const summary: Record<string, unknown> = {};
await mkdir(outDir, { recursive: true });
const shot = (page: Page, name: string) =>
	page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, outDir)) });
const browser = await chromium.launch({
	channel: process.env.PERF_BROWSER_CHANNEL ?? "chrome",
	headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
	const pageErrors: string[] = [];
	page.on("pageerror", (error) => pageErrors.push(error.message));

	// Text cell: double-click opens the editor, Cmd/Ctrl+Enter saves into a pending edit.
	await page.goto(`${BASE}/table/customers`);
	await page.waitForSelector("tbody tr[data-index]");
	const name = await cellSelector(page, "name");
	await page.dblclick(name);
	const editor = page.locator("[data-grid-cell-editor] textarea");
	await editor.waitFor();
	await editor.fill("Customer 1 (edited)");
	await editor.press("ControlOrMeta+Enter");
	await page.locator("[data-grid-cell-editor]").waitFor({ state: "detached" });
	summary.textCell = {
		shown: await page.locator(name).textContent(),
		pending: (await page.locator(name).getAttribute("data-has-update")) !== null,
	};
	assert.deepEqual(summary.textCell, { shown: "Customer 1 (edited)", pending: true });
	await shot(page, "1-text-cell-saved");

	// Escape on another, focused cell leaves the pending edit alone.
	const email = await cellSelector(page, "email");
	await page.click(email);
	await page.keyboard.press("Escape");
	summary.escapeElsewhere = {
		shown: await page.locator(name).textContent(),
		pending: (await page.locator(name).getAttribute("data-has-update")) !== null,
	};
	assert.deepEqual(summary.escapeElsewhere, { shown: "Customer 1 (edited)", pending: true });
	await shot(page, "2-escape-on-other-cell");

	// JSON cell: the Monaco editor loads on first edit.
	await page.goto(`${BASE}/table/orders`);
	await page.waitForSelector("tbody tr[data-index]");
	await page.evaluate(() => {
		const grid = document.querySelector("tbody")?.closest<HTMLElement>(".overflow-auto");
		if (grid) grid.scrollLeft = grid.scrollWidth;
	});
	const shipping = await cellSelector(page, "shipping");
	await page.dblclick(shipping);
	await page.locator("[data-grid-cell-editor] .monaco-editor").waitFor();
	summary.jsonCell = {
		editorText: (
			await page.locator("[data-grid-cell-editor] .view-lines").textContent()
		)?.replace(/\s+/g, ""),
	};
	assert.equal(
		(summary.jsonCell as { editorText: string }).editorText,
		'{"zip":"00001","carrier":"ups","express":false}',
	);
	await shot(page, "3-json-cell-editor");
	await page.keyboard.press("Escape");
	await page.locator("[data-grid-cell-editor]").waitFor({ state: "detached" });

	// Foreign-key cell: the badge opens the referenced row in a drawer.
	await page.evaluate(() => {
		const grid = document.querySelector("tbody")?.closest<HTMLElement>(".overflow-auto");
		if (grid) grid.scrollLeft = 0;
	});
	const customer = await cellSelector(page, "customer_id");
	await page.click(`${customer} [data-slot="badge"]`);
	const drawer = page.getByRole("dialog");
	await drawer.waitFor();
	summary.foreignKeyDrawer = {
		title: (await drawer.getByRole("heading").first().textContent())?.trim(),
	};
	await shot(page, "4-foreign-key-drawer");

	summary.pageErrors = pageErrors;
	assert.deepEqual(pageErrors, []);
	console.log("PASS grid editing", JSON.stringify(summary));
} catch (error) {
	await shot(page, "failure");
	throw error;
} finally {
	await writeFile(new URL("summary.json", outDir), `${JSON.stringify(summary, null, 2)}\n`);
	await browser.close();
	server.kill("SIGKILL");
}
