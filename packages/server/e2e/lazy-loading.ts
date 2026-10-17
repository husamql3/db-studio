/**
 * Code that loads on demand against a production build: the AI assistant loads when it first
 * opens, and the PostHog and Sentry SDKs load only once the server reports telemetry enabled.
 *
 * Failure modes it covers:
 * - telemetry is enabled but the SDKs never load, so analytics and error reports stop;
 * - telemetry is disabled but the SDKs load anyway, back on the startup path;
 * - the assistant no longer opens, or its code is part of the startup bundle again.
 *
 *   DATABASE_URL=postgresql://dbstudio:dbstudio@127.0.0.1:5434/dbstudio_perf \
 *     bun run --cwd packages/server tsx e2e/lazy-loading.ts [build]
 *
 * [build] names a snapshot in e2e/artifacts/builds/ and defaults to dist/. The browser is told
 * telemetry is on or off by intercepting /api/telemetry/config, and every request to PostHog
 * or Sentry is blocked and only counted, so the script reports nothing to either. The server
 * runs with telemetry off. A JSON summary goes to e2e/artifacts/lazy-loading-<build>.json.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "playwright-core";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Set DATABASE_URL to the database the app should open");
const build = process.argv[2];
const cli = fileURLToPath(
	new URL(
		build ? `./artifacts/builds/${build}/index.js` : "../dist/index.js",
		import.meta.url,
	),
);
const PORT = 4527;
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

/** Opens the app with telemetry reported on or off; returns what loaded and what was sent. */
const openApp = async (browser: Browser, telemetryEnabled: boolean) => {
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	let telemetryRequests = 0;
	await context.route(/posthog\.com|sentry\.io/, (route) => {
		telemetryRequests++;
		return route.abort();
	});
	await context.route("**/api/telemetry/config", (route) =>
		route.fulfill({
			json: { data: { enabled: telemetryEnabled, installationId: "e2e", appVersion: "e2e" } },
		}),
	);
	const page = await context.newPage();
	const pageErrors: string[] = [];
	page.on("pageerror", (error) => pageErrors.push(error.message));
	const scripts: string[] = [];
	page.on("request", (request) => {
		if (request.resourceType() === "script") scripts.push(new URL(request.url()).pathname);
	});
	await page.goto(`${BASE}/`);
	await page.waitForSelector('a[href^="/table/"]');
	// Telemetry starts after the config request; give it time to load and initialize.
	await page.waitForTimeout(2_000);
	const startupScripts = scripts.length;
	return {
		context,
		page,
		pageErrors,
		scripts,
		startupScripts,
		sentryLoaded: await page.evaluate(() => "__SENTRY__" in globalThis),
		telemetryRequests: () => telemetryRequests,
	};
};

const summary: Record<string, unknown> = {};
const browser = await chromium.launch({
	channel: process.env.PERF_BROWSER_CHANNEL ?? "chrome",
	headless: true,
});
try {
	const off = await openApp(browser, false);
	summary.telemetryOff = {
		sentryLoaded: off.sentryLoaded,
		requestsToPostHogOrSentry: off.telemetryRequests(),
	};
	assert.deepEqual(summary.telemetryOff, {
		sentryLoaded: false,
		requestsToPostHogOrSentry: 0,
	});

	// The assistant's code arrives only when it opens.
	await off.page.click('button[aria-label="Open AI assistant"]');
	const assistant = off.page.getByRole("dialog");
	await assistant.getByPlaceholder("Type a message...").waitFor();
	summary.assistant = {
		// The heading also holds the header's buttons, so only its start is the title.
		opened: (await assistant.getByRole("heading").first().textContent())?.startsWith(
			"AI Assistant",
		),
		scriptsLoadedOnOpen: off.scripts.length > off.startupScripts,
	};
	assert.deepEqual(summary.assistant, { opened: true, scriptsLoadedOnOpen: true });
	assert.deepEqual(off.pageErrors, []);
	await off.context.close();

	const on = await openApp(browser, true);
	summary.telemetryOn = {
		sentryLoaded: on.sentryLoaded,
		postHogOrSentryContacted: on.telemetryRequests() > 0,
	};
	assert.deepEqual(summary.telemetryOn, {
		sentryLoaded: true,
		postHogOrSentryContacted: true,
	});
	assert.deepEqual(on.pageErrors, []);
	await on.context.close();
	console.log("PASS lazy loading", JSON.stringify(summary));
} finally {
	await mkdir(new URL("./artifacts/", import.meta.url), { recursive: true });
	await writeFile(
		new URL(`./artifacts/lazy-loading-${build ?? "dist"}.json`, import.meta.url),
		`${JSON.stringify(summary, null, 2)}\n`,
	);
	await browser.close();
	server.kill("SIGKILL");
}
