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
 * - the saved file is readable by other users, or the browser receives a password;
 * - a request with a foreign Host header (DNS rebinding) is answered.
 *
 *   bun run --cwd packages/server prepack   # builds web and server into dist/
 *   bunx tsx packages/server/e2e/connect-flow.ts
 *
 * Nothing outside a temporary directory is touched. Screenshots and summary.json go to
 * e2e/artifacts/connect-flow/; summary.json is identical across runs.
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
const shot = (page: Page, name: string) =>
	page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, outDir)) });

const browser = await chromium.launch({
	channel: process.env.PERF_BROWSER_CHANNEL ?? "chrome",
	headless: true,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const urlField = page.getByRole("textbox", { name: "Connection URL" });
const footerConnection = (name: string) =>
	page.getByRole("button", { name, exact: true }).last();

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

	// Switch back from the footer menu.
	await footerConnection("blog.sqlite").click();
	await page.getByRole("menuitem", { name: /shop\.sqlite/ }).click();
	await page.getByText("Connected to shop.sqlite").waitFor();
	await page.getByRole("link", { name: "customers" }).waitFor();
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
