/**
 * The table grid against a production build. Cell editors mount only when a cell is first
 * edited and neighbouring pages load while the pointer is on their button, so this drives each
 * editor kind and a page change, and records what the user would see.
 *
 * Failure modes it covers:
 * - a text cell's popover never opens, or its saved value is lost when the popover closes;
 * - Escape on one cell discards edits pending in other cells (every cell used to listen for it);
 * - the JSON editor, now loaded on demand, never appears;
 * - the foreign-key drawer, now mounted on first open, never opens;
 * - a number cell's input, now mounted on edit, does not take focus with the caret after the
 *   value, keeps the edit when it closes, or keeps it after Escape;
 * - a date cell's calendar, now mounted on edit, does not open, or the picked day is not shown;
 * - a row's checkbox, or a focused cell, does not update because rows are memoized;
 * - hovering "next page" does not load it, or the click fetches it again;
 * - a page that was already loaded opens at the previous page's scroll position.
 *
 *   DATABASE_URL=postgresql://dbstudio:dbstudio@127.0.0.1:5434/dbstudio_perf \
 *     bun run --cwd packages/server e2e:grid [build]
 *
 * [build] names a snapshot in e2e/artifacts/builds/ and defaults to dist/. The database is the
 * one e2e/perf-seed.sql creates; nothing is written to it. Screenshots and a JSON summary go to
 * e2e/artifacts/grid-<build>/.
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
const outDir = new URL(`./artifacts/grid-${build ?? "dist"}/`, import.meta.url);
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
	// Columns are virtualized: after a horizontal scroll the header may not be rendered yet, and
	// the rendered range shifts again when scrolling settles. Wait for a position that holds.
	const positionOf = () =>
		page.evaluate(
			(column) =>
				[...document.querySelectorAll("thead tr th")].findIndex((th) =>
					th.textContent?.trim().startsWith(column),
				) + 1,
			column,
		);
	for (let attempt = 0; attempt < 50; attempt++) {
		const position = await positionOf();
		await page.waitForTimeout(200);
		if (position > 0 && position === (await positionOf())) {
			return `tbody tr[data-index="0"] td:nth-child(${position}) > [role="button"]`;
		}
	}
	throw new Error(`column ${column} not found`);
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

	// Number cell: double-click mounts the input with the caret after the value; leaving keeps
	// the edit pending, Escape in a new edit restores the server value.
	await page.goto(`${BASE}/table/orders`);
	await page.waitForSelector("tbody tr[data-index]");
	const quantity = await cellSelector(page, "total");
	await page.dblclick(quantity);
	const quantityInput = page.locator(`${quantity} input[type="number"]`);
	await quantityInput.waitFor();
	await page.keyboard.type("5");
	const typed = await quantityInput.inputValue();
	const focusedInput = await quantityInput.evaluate(
		(input) => input === document.activeElement,
	);
	await page.keyboard.press("Tab");
	await quantityInput.waitFor({ state: "detached" });
	summary.numberCell = {
		focusedInput,
		typed,
		shown: await page.locator(quantity).textContent(),
		pending: (await page.locator(quantity).getAttribute("data-has-update")) !== null,
	};
	await page.dblclick(quantity);
	await quantityInput.waitFor();
	await page.keyboard.press("Escape");
	await quantityInput.waitFor({ state: "detached" });
	(summary.numberCell as Record<string, unknown>).afterEscape = {
		shown: await page.locator(quantity).textContent(),
		pending: (await page.locator(quantity).getAttribute("data-has-update")) !== null,
	};
	assert.deepEqual(summary.numberCell, {
		focusedInput: true,
		typed: "79.195",
		shown: "79.195",
		pending: true,
		afterEscape: { shown: "79.19", pending: false },
	});
	await shot(page, "5-number-cell");

	// Date cell: double-click opens the calendar on the cell's month; a picked day is shown.
	const shipDate = await cellSelector(page, "ship_date");
	await page.dblclick(shipDate);
	const calendar = page.locator("[data-radix-popper-content-wrapper]");
	await calendar.waitFor();
	await calendar.getByRole("button", { name: /January 15th, 2021/ }).click();
	await calendar.waitFor({ state: "detached" });
	// Opening the calendar scrolled the grid, which moves the virtualized columns.
	const pickedDate = await cellSelector(page, "ship_date");
	summary.dateCell = {
		shown: await page.locator(pickedDate).textContent(),
		pending: (await page.locator(pickedDate).getAttribute("data-has-update")) !== null,
	};
	assert.deepEqual(summary.dateCell, { shown: "2021-01-15", pending: true });
	await shot(page, "6-date-cell");

	// Selection and focus reach memoized rows, also after the rows scroll out and back.
	await page.goto(`${BASE}/table/orders?limit=500`);
	await page.waitForSelector("tbody tr[data-index]");
	const firstRowCheckbox = 'tbody tr[data-index="0"] button[role="checkbox"]';
	await page.click(firstRowCheckbox);
	const scrollGrid = (top: number) =>
		page.evaluate((top) => {
			const grid = document.querySelector("tbody")?.closest<HTMLElement>(".overflow-auto");
			if (grid) grid.scrollTop = top;
		}, top);
	await scrollGrid(5_000);
	await page.waitForSelector('tbody tr[data-index="0"]', { state: "detached" });
	await scrollGrid(0);
	const status = await cellSelector(page, "status");
	await page.click(status);
	summary.selectionAndFocus = {
		firstRowChecked: await page.getAttribute(firstRowCheckbox, "aria-checked"),
		secondRowChecked: await page.getAttribute(
			'tbody tr[data-index="1"] button[role="checkbox"]',
			"aria-checked",
		),
		clickedCellFocused: (await page.getAttribute(status, "data-focused")) !== null,
	};
	assert.deepEqual(summary.selectionAndFocus, {
		firstRowChecked: "true",
		secondRowChecked: "false",
		clickedCellFocused: true,
	});
	await shot(page, "7-selection-and-focus");

	// Paging: hovering "next page" loads it, and the click shows it from the top without
	// fetching it again, even though the grid stays mounted.
	await page.goto(`${BASE}/table/orders`);
	await page.waitForSelector("tbody tr[data-index]");
	await page.evaluate(() => {
		const grid = document.querySelector("tbody")?.closest<HTMLElement>(".overflow-auto");
		if (grid) grid.scrollTop = grid.scrollHeight;
	});
	const isPageRequest = (url: string) =>
		url.includes("/tables/orders/data") && url.includes("cursor=");
	const prefetched = page.waitForResponse((response) => isPageRequest(response.url()));
	await page.hover('button[aria-label="Go to next page"]');
	await prefetched;
	let requestsAfterClick = 0;
	page.on("request", (request) => {
		if (isPageRequest(request.url())) requestsAfterClick++;
	});
	await page.click('button[aria-label="Go to next page"]');
	const firstRowId =
		'tbody tr[data-index="0"] td:nth-child(2) [data-slot="grid-cell-content"]';
	await page.waitForFunction(
		(selector) => document.querySelector(selector)?.textContent === "51",
		firstRowId,
	);
	summary.paging = {
		requestsAfterClick,
		scrollTop: await page.evaluate(
			() => document.querySelector("tbody")?.closest<HTMLElement>(".overflow-auto")?.scrollTop,
		),
		firstRowId: await page.locator(firstRowId).textContent(),
	};
	assert.deepEqual(summary.paging, { requestsAfterClick: 0, scrollTop: 0, firstRowId: "51" });
	await shot(page, "8-next-page");

	summary.pageErrors = pageErrors;
	assert.deepEqual(pageErrors, []);
	console.log("PASS grid", JSON.stringify(summary));
} catch (error) {
	await shot(page, "failure");
	throw error;
} finally {
	await writeFile(new URL("summary.json", outDir), `${JSON.stringify(summary, null, 2)}\n`);
	await browser.close();
	server.kill("SIGKILL");
}
