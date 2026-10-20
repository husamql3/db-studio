/**
 * Starting db-studio without a database URL, then connecting and switching from the browser,
 * against a production build and two scratch SQLite files.
 *
 * Failure modes it covers:
 * - with no URL the CLI prompts or exits instead of serving the Connect page;
 * - the app opens on a data page that needs a connection instead of /connect;
 * - a mistyped SQLite path creates an empty file instead of being refused;
 * - a relative SQLite path is saved relative, so it breaks from another directory;
 * - after connecting, the app still shows the previous database's tables;
 * - a failed switch drops the working connection;
 * - a tab opened on the previous connection still reaches the new one (same engine);
 * - an unsaved cell edit survives a switch and can be saved into the wrong database;
 * - the saved file is readable by other users, or the browser receives a password;
 * - a request with a foreign Host header (DNS rebinding) is answered.
 *
 *   bun run --cwd packages/server prepack   # builds web and server into dist/
 *   bunx tsx packages/server/e2e/connect-flow.ts
 *
 * Nothing outside a temporary directory is touched. Screenshots and summary.json go to
 * e2e/artifacts/connect-flow/; summary.json is identical across runs, and screenshots draw the
 * scratch directory as `<tmp>`.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { chromium, type Page } from "playwright-core";

const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const outDir = new URL("./artifacts/connect-flow/", import.meta.url);
const PORT = 4526;
const BASE = `http://127.0.0.1:${PORT}`;

const dir = await mkdtemp(join(tmpdir(), "db-studio-connect-"));
const configDir = join(dir, "config");
const seed = async (file: string, statements: string[]) => {
	const client = createClient({ url: `file:${join(dir, file)}` });
	await client.batch(statements, "write");
	client.close();
};
await seed("shop.sqlite", [
	"CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT)",
	"INSERT INTO customers (name) VALUES ('Ada')",
]);
await seed("blog.sqlite", ["CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT)"]);
await writeFile(join(dir, "empty.env"), "");

const env = { ...process.env };
delete env.DATABASE_URL;
const server = spawn("node", [cli, "--no-open", "-p", String(PORT), "-e", "empty.env"], {
	cwd: dir,
	env: {
		...env,
		NODE_ENV: "production",
		DB_STUDIO_TELEMETRY: "0",
		DB_STUDIO_CONFIG_DIR: configDir,
	},
	stdio: "ignore",
});
for (;;) {
	if (server.exitCode !== null) throw new Error(`server exited with ${server.exitCode}`);
	const ready = await fetch(`${BASE}/api/connections`)
		.then((response) => response.ok)
		.catch(() => false);
	if (ready) break;
	await new Promise((resolve) => setTimeout(resolve, 50));
}

/** Status of a request whose Host header names another site, as a rebinding page would send. */
const statusWithHost = (host: string) =>
	new Promise<number | undefined>((resolve, reject) => {
		request({ port: PORT, host: "127.0.0.1", path: "/api/connections", headers: { host } })
			.on("response", (response) => resolve(response.statusCode))
			.on("error", reject)
			.end();
	});

// The server resolves paths through symlinks (macOS: /var → /private/var).
const realDir = await realpath(dir);
const normalize = (text: string) => text.replaceAll(realDir, "<tmp>").replaceAll(dir, "<tmp>");
const summary: Record<string, unknown> = {};
await mkdir(outDir, { recursive: true });
/** Screenshots show file paths; `<tmp>` replaces the scratch directory while the shot is taken. */
const shot = async (page: Page, name: string) => {
	await page.evaluate(
		(paths) => {
			const swap = (text: string) =>
				paths.reduce((t, path) => t.replaceAll(path, "<tmp>"), text);
			const undo: (() => void)[] = [];
			const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
			for (let node = walker.nextNode(); node; node = walker.nextNode()) {
				const text = node.nodeValue ?? "";
				if (swap(text) === text) continue;
				const textNode = node;
				textNode.nodeValue = swap(text);
				undo.push(() => {
					textNode.nodeValue = text;
				});
			}
			for (const input of document.querySelectorAll("input")) {
				const value = input.value;
				if (swap(value) === value) continue;
				input.value = swap(value);
				undo.push(() => {
					input.value = value;
				});
			}
			Object.assign(window, {
				undoShot: () => {
					for (const restore of undo) restore();
				},
			});
		},
		[realDir, dir],
	);
	await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, outDir)) });
	await page.evaluate(() => (window as unknown as { undoShot: () => void }).undoShot());
};

const connectionId = async () => {
	const state = (await (await fetch(`${BASE}/api/connections`)).json()) as {
		data: { active: { connectionId: string } };
	};
	return state.data.active.connectionId;
};
/** Status of a database request from a tab that last saw connection `id`. */
const tablesStatusFrom = async (id: string) =>
	(await fetch(`${BASE}/api/sqlite/tables?db=main`, { headers: { "X-Connection-Id": id } }))
		.status;

const browser = await chromium.launch({
	channel: process.env.PERF_BROWSER_CHANNEL ?? "chrome",
	headless: true,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
// tsx wraps named functions in `__name(...)`, which the page does not define.
await page.addInitScript("globalThis.__name = (fn) => fn;");
const urlField = page.getByRole("textbox", { name: "Connection URL" });
const footerConnection = (name: string) =>
	page.getByRole("button", { name, exact: true }).last();
const saveButton = () => page.getByRole("button", { name: "Save changes to the table" });

try {
	const pageErrors: string[] = [];
	page.on("pageerror", (error) => pageErrors.push(error.message));

	// No URL: the app opens on /connect.
	await page.goto(`${BASE}/table`);
	await page.waitForURL(`${BASE}/connect`);
	await page.getByText("Connections you open are saved here.").waitFor();
	summary.firstRun = { path: new URL(page.url()).pathname };
	await shot(page, "1-first-run");

	// A mistyped file is refused, and no file is created.
	await urlField.fill(`sqlite://${join(dir, "shpo.sqlite")}`);
	await urlField.press("Enter");
	const missing = page.getByRole("alert");
	await missing.waitFor();
	summary.missingFile = {
		message: normalize((await missing.textContent()) ?? ""),
		created: await stat(join(dir, "shpo.sqlite")).then(
			() => true,
			() => false,
		),
	};
	await shot(page, "2-missing-file");

	// A relative path connects, from the server's working directory.
	await urlField.fill("sqlite://./shop.sqlite");
	await urlField.press("Enter");
	await page.waitForURL(`${BASE}/`);
	await page.getByRole("link", { name: "customers" }).waitFor();
	await shot(page, "3-connected");
	const shopConnection = await connectionId();

	// An edit left unsaved before switching away.
	await page.getByRole("link", { name: "customers" }).click();
	await page.locator("tbody tr[data-index] td", { hasText: /^Ada$/ }).dblclick();
	const editor = page.locator("[data-grid-cell-editor] textarea");
	await editor.fill("Draft");
	await editor.press("ControlOrMeta+Enter");
	await saveButton().waitFor();
	await shot(page, "3b-unsaved-edit");

	// Switch through the Connect page.
	await footerConnection("shop.sqlite").click();
	await page.getByRole("menuitem", { name: "All connections…" }).click();
	await urlField.fill(`sqlite://${join(dir, "blog.sqlite")}`);
	await urlField.press("Enter");
	await page.getByRole("link", { name: "posts" }).waitFor();
	summary.afterSwitch = {
		tables: await page.getByRole("link", { name: /^(posts|customers)$/ }).allTextContents(),
	};
	await shot(page, "4-switched");

	// A tab that still shows shop.sqlite is refused, not answered from blog.sqlite.
	summary.staleTab = {
		previousConnection: await tablesStatusFrom(shopConnection),
		currentConnection: await tablesStatusFrom(await connectionId()),
	};

	// Switch back from the footer menu.
	await footerConnection("blog.sqlite").click();
	await page.getByRole("menuitem", { name: /shop\.sqlite/ }).click();
	await page.getByText("Connected to shop.sqlite").waitFor();
	await page.getByRole("link", { name: "customers" }).click();
	await page.locator("tbody tr[data-index]").first().waitFor();
	summary.unsavedEditAfterSwitch = {
		saveButtonShown: await saveButton().isVisible(),
		names: await page
			.locator("tbody tr[data-index] td", { hasText: /^(Ada|Draft)$/ })
			.allTextContents(),
	};
	await shot(page, "5-switched-from-menu");

	// A failed switch keeps the working connection.
	await rename(join(dir, "blog.sqlite"), join(dir, "blog.hidden"));
	await footerConnection("shop.sqlite").click();
	await page.getByRole("menuitem", { name: /blog\.sqlite/ }).click();
	const failure = page.getByText("Still on the previous connection");
	await failure.waitFor();
	// The open menu hides the rest of the page from the accessibility tree until it closes.
	await page.getByRole("menu").waitFor({ state: "hidden" });
	summary.failedSwitch = {
		toast: normalize((await failure.textContent()) ?? ""),
		stillShowing: await page.getByRole("link", { name: "customers" }).isVisible(),
	};
	await rename(join(dir, "blog.hidden"), join(dir, "blog.sqlite"));
	await shot(page, "6-failed-switch");

	// What was saved, and what the browser was told.
	const file = join(configDir, "connections.json");
	const saved = JSON.parse(await readFile(file, "utf8")) as {
		connections: { name: string; url: string }[];
	};
	const state = (await (await fetch(`${BASE}/api/connections`)).json()) as {
		data: { connections: { name: string; maskedUrl: string }[] };
	};
	summary.saved = {
		fileMode: ((await stat(file)).mode & 0o777).toString(8),
		dirMode: ((await stat(configDir)).mode & 0o777).toString(8),
		connections: saved.connections
			.map(({ name, url }) => ({ name, url: normalize(url) }))
			.sort((a, b) => a.name.localeCompare(b.name)),
		browserSees: state.data.connections
			.map(({ name, maskedUrl }) => ({ name, maskedUrl: normalize(maskedUrl) }))
			.sort((a, b) => a.name.localeCompare(b.name)),
	};

	summary.hostHeader = {
		foreign: await statusWithHost("evil.example.com"),
		loopback: await statusWithHost(`127.0.0.1:${PORT}`),
	};

	summary.pageErrors = pageErrors;
	assert.deepEqual(summary, {
		firstRun: { path: "/connect" },
		missingFile: { message: "No database file at <tmp>/shpo.sqlite", created: false },
		afterSwitch: { tables: ["posts"] },
		staleTab: { previousConnection: 409, currentConnection: 200 },
		unsavedEditAfterSwitch: { saveButtonShown: false, names: ["Ada"] },
		failedSwitch: {
			toast: "No database file at <tmp>/blog.sqlite. Still on the previous connection.",
			stillShowing: true,
		},
		saved: {
			fileMode: "600",
			dirMode: "700",
			connections: [
				{ name: "blog.sqlite", url: "sqlite://<tmp>/blog.sqlite" },
				{ name: "shop.sqlite", url: "sqlite://<tmp>/shop.sqlite" },
			],
			browserSees: [
				{ name: "blog.sqlite", maskedUrl: "sqlite://<tmp>/blog.sqlite" },
				{ name: "shop.sqlite", maskedUrl: "sqlite://<tmp>/shop.sqlite" },
			],
		},
		hostHeader: { foreign: 403, loopback: 200 },
		pageErrors: [],
	});
	console.log("PASS connect-flow");
} catch (error) {
	await shot(page, "failure");
	throw error;
} finally {
	await writeFile(new URL("summary.json", outDir), `${JSON.stringify(summary, null, 2)}\n`);
	await browser.close();
	server.kill("SIGKILL");
	await rm(dir, { recursive: true, force: true });
}
