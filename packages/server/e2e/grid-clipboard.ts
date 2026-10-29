/**
 * Range selection, copy and paste in the table grid against a production build and a scratch
 * PostgreSQL table, ending with the rows the database holds after Save.
 *
 * Failure modes it covers:
 * - dragging across cells selects nothing, or a different rectangle than the one dragged over;
 * - copy leaves out the column names, or copies the wrong cells or order;
 * - pasting a range copied from the grid writes its header row into the first row;
 * - paste writes past the last row instead of skipping those cells;
 * - a value a column cannot take (text in an integer, an unknown boolean or enum value) is
 *   staged without a preview, or the valid cells of that paste are lost;
 * - staged cells do not reach the database on Save, or land in the wrong rows.
 *
 *   DATABASE_URL=postgresql://dbstudio:dbstudio@127.0.0.1:5434/dbstudio \
 *     bunx tsx e2e/grid-clipboard.ts
 *
 * Run `bun run prepack` first. Screenshots, the copied text and a JSON summary go to
 * e2e/artifacts/grid-clipboard/.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { chromium, type Page } from "playwright-core";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.startsWith("postgresql://")) {
	throw new Error("Set DATABASE_URL to a PostgreSQL database");
}
const TABLE = "dbstudio_e2e_clipboard";
const PORT = 4531;
const BASE = `http://127.0.0.1:${PORT}`;
const outDir = new URL("./artifacts/grid-clipboard/", import.meta.url);

const db = new pg.Client({ connectionString: databaseUrl });
await db.connect();
await db.query(`
	DROP TABLE IF EXISTS ${TABLE};
	DROP TYPE IF EXISTS ${TABLE}_status;
	CREATE TYPE ${TABLE}_status AS ENUM ('open', 'closed');
	CREATE TABLE ${TABLE} (
		id integer PRIMARY KEY,
		name text NOT NULL,
		qty integer,
		active boolean,
		status ${TABLE}_status,
		note text
	);
	INSERT INTO ${TABLE} VALUES
		(1, 'Ada', 1, false, 'closed', NULL),
		(2, 'Bob', 2, true, 'open', 'vip'),
		(3, 'Cyd', 3, true, 'open', NULL),
		(4, 'Dee', 4, false, 'closed', NULL),
		(5, 'Eve', 5, true, 'open', NULL);
`);

const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));
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

const cell = async (page: Page, row: number, column: string) => {
	const position = await page.evaluate(
		(column) =>
			[...document.querySelectorAll("thead tr th")].findIndex((th) =>
				th.textContent?.trim().startsWith(column),
			) + 1,
		column,
	);
	if (position === 0) throw new Error(`column ${column} not found`);
	return page.locator(
		`tbody tr[data-index="${row}"] td:nth-child(${position}) > [role="button"]`,
	);
};

/** Fires the clipboard event the browser sends on Cmd/Ctrl+C or V at the focused cell. */
const clipboard = (page: Page, type: "copy" | "paste", text = "") =>
	page.evaluate(
		([type, text]) => {
			const data = new DataTransfer();
			if (text) data.setData("text/plain", text);
			document.activeElement?.dispatchEvent(
				new ClipboardEvent(type, { clipboardData: data, bubbles: true, cancelable: true }),
			);
			return data.getData("text/plain");
		},
		[type, text] as const,
	);

const pending = (page: Page) =>
	page.$$eval("tbody [data-has-update]", (cells) =>
		cells.map((cell) => cell.textContent?.trim()),
	);

const summary: Record<string, unknown> = {};
await mkdir(outDir, { recursive: true });
const shot = (page: Page, name: string) =>
	page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, outDir)) });
const browser = await chromium.launch({
	channel: process.env.PERF_BROWSER_CHANNEL ?? "chrome",
	headless: true,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
try {
	const pageErrors: string[] = [];
	page.on("pageerror", (error) => pageErrors.push(error.message));
	await page.goto(`${BASE}/table/${TABLE}`);
	await page.waitForSelector("tbody tr[data-index]");

	// Drag from Ada's name to Cyd's qty: a 3 x 2 rectangle.
	const from = await (await cell(page, 0, "name")).boundingBox();
	const to = await (await cell(page, 2, "qty")).boundingBox();
	if (!from || !to) throw new Error("cells not laid out");
	await page.mouse.move(from.x + 10, from.y + 10);
	await page.mouse.down();
	await page.mouse.move(to.x + 10, to.y + 10, { steps: 5 });
	await page.mouse.up();
	summary.selected = await page.$$eval("tbody [data-selected]", (cells) =>
		cells.map((cell) => cell.textContent?.trim()),
	);
	assert.deepEqual(summary.selected, ["Ada", "1", "Bob", "2", "Cyd", "3"]);
	await shot(page, "1-range-selected");

	const copied = await clipboard(page, "copy");
	summary.copied = copied;
	assert.equal(copied, "name\tqty\nAda\t1\nBob\t2\nCyd\t3");
	await writeFile(new URL("copied.tsv", outDir), copied);

	// Paste the copied range at Dee's name: the header row is dropped, Cyd's row has no row
	// below Eve to land in.
	await (await cell(page, 3, "name")).click();
	await clipboard(page, "paste", copied);
	await page.getByText("4 changes staged; 2 cells outside the grid skipped").waitFor();
	summary.afterCopiedPaste = await pending(page);
	assert.deepEqual(summary.afterCopiedPaste, ["Ada", "1", "Bob", "2"]);
	await shot(page, "2-copied-range-pasted");

	// Spreadsheet cells with three values their columns cannot take open the preview.
	await (await cell(page, 0, "qty")).click();
	await clipboard(page, "paste", "abc\ttrue\topen\r\n12\tmaybe\tpending\r\n");
	const dialog = page.getByRole("alertdialog");
	await dialog.waitFor();
	summary.preview = await dialog
		.locator("tbody tr")
		.evaluateAll((rows) =>
			rows.map((row) => [...row.querySelectorAll("td")].map((td) => td.textContent?.trim())),
		);
	assert.deepEqual(summary.preview, [
		["1", "qty", "abc", "Not a number"],
		["2", "active", "maybe", "Not true or false"],
		["2", "status", "pending", "Not one of open, closed"],
	]);
	await shot(page, "3-invalid-values-preview");
	await dialog.getByRole("button", { name: "Stage 3 changes" }).click();
	await dialog.waitFor({ state: "detached" });
	summary.afterPreview = await pending(page);
	await shot(page, "4-valid-values-staged");

	await page.getByRole("button", { name: "Save changes to the table" }).click();
	await page
		.getByText("7 changes saved successfully")
		.or(page.getByText(/updated/i))
		.first()
		.waitFor();
	await page.waitForFunction(() => !document.querySelector("tbody [data-has-update]"));
	await shot(page, "5-saved");

	summary.rows = (await db.query(`SELECT * FROM ${TABLE} ORDER BY id`)).rows;
	assert.deepEqual(summary.rows, [
		{ id: 1, name: "Ada", qty: 1, active: true, status: "open", note: null },
		{ id: 2, name: "Bob", qty: 12, active: true, status: "open", note: "vip" },
		{ id: 3, name: "Cyd", qty: 3, active: true, status: "open", note: null },
		{ id: 4, name: "Ada", qty: 1, active: false, status: "closed", note: null },
		{ id: 5, name: "Bob", qty: 2, active: true, status: "open", note: null },
	]);
	summary.pageErrors = pageErrors;
	assert.deepEqual(pageErrors, []);
	console.log("PASS grid clipboard");
} finally {
	await writeFile(new URL("summary.json", outDir), `${JSON.stringify(summary, null, "\t")}\n`);
	await browser.close();
	server.kill();
	await db.query(`DROP TABLE IF EXISTS ${TABLE}; DROP TYPE IF EXISTS ${TABLE}_status;`);
	await db.end();
}
