/**
 * Performance benchmark for production builds. Each build is a snapshot of `dist/` (the CLI with
 * the web build inside) under e2e/artifacts/builds/<name>/. Every build runs against a database
 * seeded by e2e/perf-seed.sql, interleaved run by run so background load on the machine lands on
 * each build equally, and the medians go to e2e/artifacts/perf-<name>-vs-<name>.json.
 *
 *   bun run build && cp -R packages/server/dist packages/server/e2e/artifacts/builds/after
 *   DATABASE_URL=postgresql://dbstudio:dbstudio@127.0.0.1:5434/dbstudio_perf \
 *     bun run --cwd packages/server e2e:perf before after
 *
 * PERF_RUNS (default 5) sets the runs per build; PERF_CPU_THROTTLE (default 1) slows the
 * browser's CPU so the numbers resemble a mid-range laptop rather than a fast dev machine.
 * PERF_DB_LATENCY_MS (default 0) delays every packet between server and database by that much
 * each way, standing in for a database across a network.
 */
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { connect, createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { type Browser, chromium, type Page } from "playwright-core";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.startsWith("postgresql://")) {
	throw new Error("Set DATABASE_URL to a PostgreSQL database seeded by e2e/perf-seed.sql");
}
const db = encodeURIComponent(decodeURIComponent(new URL(databaseUrl).pathname.slice(1)));
const builds = process.argv.slice(2);
if (builds.length === 0) throw new Error("Name at least one build in e2e/artifacts/builds/");
const cliFor = (build: string) =>
	fileURLToPath(new URL(`./artifacts/builds/${build}/index.js`, import.meta.url));
for (const build of builds) {
	if (!existsSync(cliFor(build))) throw new Error(`Missing ${cliFor(build)}`);
}
const RUNS = Number(process.env.PERF_RUNS ?? 5);
const DB_LATENCY_MS = Number(process.env.PERF_DB_LATENCY_MS ?? 0);

/** Relays connections to the database, holding each chunk for DB_LATENCY_MS in each direction. */
const startLatencyRelay = async (target: URL) => {
	const relay = (from: Socket, to: Socket) => {
		// Equal delays fire in arrival order, so the stream stays in order.
		from.on("data", (chunk) => setTimeout(() => to.write(chunk), DB_LATENCY_MS));
		from.on("close", () => setTimeout(() => to.destroy(), DB_LATENCY_MS));
		from.on("error", () => to.destroy());
	};
	const server = createServer((client) => {
		const upstream = connect(Number(target.port || 5432), target.hostname);
		relay(client, upstream);
		relay(upstream, client);
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	server.unref();
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("relay has no port");
	const relayed = new URL(target);
	relayed.hostname = "127.0.0.1";
	relayed.port = String(address.port);
	return relayed.toString();
};
const serverDatabaseUrl =
	DB_LATENCY_MS > 0 ? await startLatencyRelay(new URL(databaseUrl)) : databaseUrl;
const CPU_THROTTLE = Number(process.env.PERF_CPU_THROTTLE ?? 1);
const PORT = 4517;
const BASE = `http://127.0.0.1:${PORT}`;

const median = (values: number[]) => {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	const value =
		sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
	return Math.round(value * 10) / 10;
};

const startServer = async (cli: string) => {
	const startedAt = performance.now();
	// A temporary cwd keeps the CLI from picking up a developer's .env.
	const child = spawn(
		"node",
		[cli, "--no-open", "-p", String(PORT), "-d", serverDatabaseUrl],
		{
			cwd: tmpdir(),
			env: {
				...process.env,
				NODE_ENV: "production",
				DB_STUDIO_TELEMETRY: "0",
				HOST: "127.0.0.1",
			},
			stdio: "ignore",
		},
	);
	for (;;) {
		if (child.exitCode !== null) throw new Error(`server exited with ${child.exitCode}`);
		const ready = await fetch(`${BASE}/api/databases`)
			.then((response) => response.ok)
			.catch(() => false);
		if (ready) return { child, startupMs: performance.now() - startedAt };
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
};

/** CPU time a process has used so far, from `ps` (10 ms resolution). */
const processCpuMs = (pid: number) => {
	const [minutes = "0", seconds = "0"] = execFileSync("ps", [
		"-o",
		"cputime=",
		"-p",
		String(pid),
	])
		.toString()
		.trim()
		.split(":");
	return (Number(minutes) * 60 + Number(seconds)) * 1000;
};

const stopServer = async (child: ChildProcess) => {
	// SIGTERM waits up to 30s for open keep-alive connections; shutdown is not measured here.
	child.kill("SIGKILL");
	if (child.exitCode === null) await once(child, "exit");
};

const timeFetch = async (path: string) => {
	const startedAt = performance.now();
	const response = await fetch(`${BASE}${path}`);
	const body = await response.text();
	if (!response.ok) throw new Error(`${path}: ${response.status} ${body}`);
	return { ms: performance.now() - startedAt, body };
};

type PerfHelpers = {
	gridShows: (column: string) => boolean;
	waitFor: (check: () => boolean) => Promise<number>;
	clickAndWait: (selector: string, check: () => boolean) => Promise<number>;
	firstRowText: () => string | undefined;
	scrollGrid: () => Promise<number[]>;
};
declare global {
	interface Window {
		__perf: PerfHelpers;
	}
}

/** Runs in the page before the app; every timing is measured in-page against performance.now(). */
const installPerfHelpers = () => {
	const helpers: PerfHelpers = {
		gridShows: (column) =>
			[...document.querySelectorAll("thead th")].some((th) =>
				th.textContent?.trim().startsWith(column),
			) && document.querySelector("tbody tr[data-index]") !== null,
		waitFor: (check) =>
			new Promise((resolve, reject) => {
				if (check()) return resolve(performance.now());
				const timeout = setTimeout(() => reject(new Error("timed out")), 30_000);
				const observer = new MutationObserver(() => {
					if (!check()) return;
					observer.disconnect();
					clearTimeout(timeout);
					resolve(performance.now());
				});
				observer.observe(document, {
					subtree: true,
					childList: true,
					characterData: true,
					attributes: true,
				});
			}),
		clickAndWait: async (selector, check) => {
			const element = document.querySelector<HTMLElement>(selector);
			if (!element) throw new Error(`missing ${selector}`);
			const startedAt = performance.now();
			element.click();
			return (await helpers.waitFor(check)) - startedAt;
		},
		firstRowText: () =>
			document.querySelector('tbody tr[data-index="0"]')?.textContent ?? undefined,
		/** Scrolls the grid top to bottom, 100px per frame, and returns each frame's duration. */
		scrollGrid: async () => {
			const container = document
				.querySelector("tbody")
				?.closest<HTMLElement>(".overflow-auto");
			if (!container) throw new Error("missing grid container");
			const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
			container.scrollTop = 0;
			await nextFrame();
			await nextFrame();
			const frames: number[] = [];
			let last = performance.now();
			while (container.scrollTop + container.clientHeight < container.scrollHeight - 1) {
				container.scrollTop += 100;
				await nextFrame();
				const now = performance.now();
				frames.push(now - last);
				last = now;
			}
			return frames;
		},
	};
	window.__perf = helpers;
};

const scriptKB = (page: Page) =>
	page.evaluate(
		() =>
			performance
				.getEntriesByType("resource")
				.filter((entry) => entry.name.endsWith(".js"))
				.reduce(
					(total, entry) => total + (entry as PerformanceResourceTiming).decodedBodySize,
					0,
				) / 1024,
	);

/** One full pass over a build: server start, API latency, then the browser flows. */
const measure = async (browser: Browser, cli: string, pageErrors: Set<string>) => {
	const metrics: Record<string, number> = {};
	const { child, startupMs } = await startServer(cli);
	metrics.serverStartupMs = startupMs;
	metrics.serverStartupCpuMs = child.pid ? processCpuMs(child.pid) : 0;
	try {
		// API latency without the browser; the first request warms the connection pool.
		await timeFetch(`/api/pg/tables?db=${db}`);
		const tablesList: number[] = [];
		const firstPage: number[] = [];
		const nextPage: number[] = [];
		for (let repeat = 0; repeat < 3; repeat++) {
			tablesList.push((await timeFetch(`/api/pg/tables?db=${db}`)).ms);
			const first = await timeFetch(`/api/pg/tables/orders/data?db=${db}&limit=50`);
			firstPage.push(first.ms);
			const { nextCursor } = (
				JSON.parse(first.body) as { data: { meta: { nextCursor: string } } }
			).data.meta;
			nextPage.push(
				(await timeFetch(`/api/pg/tables/orders/data?db=${db}&limit=50&cursor=${nextCursor}`))
					.ms,
			);
		}
		metrics.apiTablesListMs = Math.min(...tablesList);
		metrics.apiFirstPageMs = Math.min(...firstPage);
		metrics.apiNextPageMs = Math.min(...nextPage);

		const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
		try {
			// tsx wraps named functions in `__name(...)`, which the page does not define.
			await context.addInitScript("globalThis.__name = (fn) => fn;");
			await context.addInitScript(installPerfHelpers);
			const page = await context.newPage();
			page.on("pageerror", (error) => pageErrors.add(error.message));
			const cdp = await context.newCDPSession(page);
			await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });
			await cdp.send("Performance.enable");
			/**
			 * Chrome's counters for the page. ThreadTime is main-thread CPU time, which grows less
			 * than wall time while other processes hold the CPU. LayoutCount and RecalcStyleCount
			 * count layouts and style recalculations, which no amount of machine load changes.
			 */
			const counters = async () => {
				const { metrics: list } = await cdp.send("Performance.getMetrics");
				const value = (name: string) =>
					list.find((metric) => metric.name === name)?.value ?? 0;
				return {
					cpuMs: value("ThreadTime") * 1000,
					layouts: value("LayoutCount"),
					styleRecalcs: value("RecalcStyleCount"),
				};
			};
			/**
			 * Repeats a step, keeping its fastest wall and CPU time, and the layouts and style
			 * recalculations of its last attempt.
			 */
			const bestOf = async (name: string, times: number, step: () => Promise<number>) => {
				let wall = Number.POSITIVE_INFINITY;
				let cpu = Number.POSITIVE_INFINITY;
				for (let attempt = 0; attempt < times; attempt++) {
					const before = await counters();
					wall = Math.min(wall, await step());
					const after = await counters();
					cpu = Math.min(cpu, after.cpuMs - before.cpuMs);
					metrics[`${name}Layouts`] = after.layouts - before.layouts;
					metrics[`${name}StyleRecalcs`] = after.styleRecalcs - before.styleRecalcs;
				}
				metrics[`${name}Ms`] = wall;
				metrics[`${name}CpuMs`] = cpu;
			};
			const sidebarReady = () =>
				page.evaluate(() =>
					window.__perf.waitFor(
						() => document.querySelector('a[href="/table/orders"]') !== null,
					),
				);
			const showTable = (table: string, column: string) =>
				page.evaluate(
					([table, column]) =>
						window.__perf.clickAndWait(`a[href="/table/${table}"]`, () =>
							window.__perf.gridShows(column),
						),
					[table, column] as const,
				);

			// Cold start: empty cache, navigation start to the sidebar listing tables. The page
			// gets a fresh renderer, so its thread time so far is the cold start's.
			await page.goto(`${BASE}/`, { waitUntil: "commit" });
			metrics.coldLoadMs = await sidebarReady();
			metrics.coldLoadCpuMs = (await counters()).cpuMs;
			metrics.coldScriptKB = await scriptKB(page);

			// Warm start: same browser cache, reload.
			await bestOf("warmLoad", 3, async () => {
				await page.reload({ waitUntil: "commit" });
				return sidebarReady();
			});

			// Open a table for the first time: route code, columns and rows all load.
			await bestOf("openTable", 1, () => showTable("orders", "customer_id"));

			// Page forward to older rows; every page is fetched for the first time.
			await bestOf("nextPage", 5, () =>
				page.evaluate(() => {
					const before = window.__perf.firstRowText();
					return window.__perf.clickAndWait('button[aria-label="Go to next page"]', () => {
						const now = window.__perf.firstRowText();
						return now !== undefined && now !== before;
					});
				}),
			);

			// Leave for another table, then come back to one already seen.
			await bestOf("revisitTable", 5, async () => {
				await showTable("customers", "email");
				return showTable("orders", "customer_id");
			});

			// Scroll a 500-row page.
			await page.goto(`${BASE}/table/orders?limit=500`, { waitUntil: "commit" });
			await page.evaluate(() =>
				window.__perf.waitFor(() => window.__perf.gridShows("customer_id")),
			);
			const scrollStart = await counters();
			const frames = await page.evaluate(() => window.__perf.scrollGrid());
			const scrollEnd = await counters();
			metrics.scrollCpuMs = scrollEnd.cpuMs - scrollStart.cpuMs;
			metrics.scrollLayouts = scrollEnd.layouts - scrollStart.layouts;
			const sorted = [...frames].sort((a, b) => a - b);
			metrics.scrollMeanFrameMs = frames.reduce((a, b) => a + b, 0) / frames.length;
			metrics.scrollP95FrameMs = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
			metrics.scrollFramesOver50ms = frames.filter((frame) => frame > 50).length;
			metrics.gridDomNodes = await page.evaluate(
				() => document.querySelectorAll("table *").length,
			);
			const { result } = await cdp.send("Runtime.evaluate", { expression: "document" });
			const { listeners } = await cdp.send("DOMDebugger.getEventListeners", {
				objectId: result.objectId as string,
			});
			metrics.documentKeydownListeners = listeners.filter(
				(listener) => listener.type === "keydown",
			).length;
		} finally {
			await context.close();
		}
	} finally {
		await stopServer(child);
	}
	return metrics;
};

const browser = await chromium.launch({
	channel: process.env.PERF_BROWSER_CHANNEL ?? "chrome",
	headless: true,
});
const samples = new Map(builds.map((build) => [build, [] as Record<string, number>[]]));
const pageErrors = new Set<string>();
try {
	// A discarded first pass warms the OS file cache, Postgres buffers and the browser.
	console.error(`[perf] warm-up ${builds[0]}`);
	await measure(browser, cliFor(builds[0] ?? ""), pageErrors);
	for (let run = 0; run < RUNS; run++) {
		// Alternate the order so neither build always runs first.
		const order = run % 2 ? [...builds].reverse() : builds;
		for (const build of order) {
			console.error(`[perf] run ${run + 1}/${RUNS} ${build}`);
			samples.get(build)?.push(await measure(browser, cliFor(build), pageErrors));
		}
	}
} finally {
	await browser.close();
}

/**
 * Best-of-N is the headline figure: load from other processes only ever adds time, so the
 * fastest run is the closest to the build's own cost. The median shows how typical runs went.
 */
const summarize = (pick: (values: number[]) => number) =>
	Object.fromEntries(
		builds.map((build) => {
			const runs = samples.get(build) ?? [];
			const names = Object.keys(runs[0] ?? {});
			return [
				build,
				Object.fromEntries(names.map((name) => [name, pick(runs.map((r) => r[name] ?? 0))])),
			];
		}),
	);
const best = summarize((values) => Math.round(Math.min(...values) * 10) / 10);
const medians = summarize(median);
/**
 * Paired change of each build against the build listed before it: the % difference between
 * the two passes of the same run, which ran back to back, then the median over runs.
 */
const pairedChange = Object.fromEntries(
	builds.slice(1).map((build, index) => {
		const before = samples.get(builds[index] ?? "") ?? [];
		const after = samples.get(build) ?? [];
		const names = Object.keys(after[0] ?? {});
		return [
			`${build} vs ${builds[index]} (%)`,
			Object.fromEntries(
				names.map((name) => [
					name,
					median(
						after.map((run, i) => {
							const base = before[i]?.[name] ?? 0;
							return base === 0 ? 0 : (((run[name] ?? 0) - base) / base) * 100;
						}),
					),
				]),
			),
		];
	}),
);
const results = {
	runs: RUNS,
	cpuThrottle: CPU_THROTTLE,
	dbLatencyMs: DB_LATENCY_MS,
	best,
	medians,
	pairedChange,
	samples: Object.fromEntries(samples),
	pageErrors: [...pageErrors],
};
await mkdir(new URL("./artifacts/", import.meta.url), { recursive: true });
await writeFile(
	new URL(
		`./artifacts/perf-${builds.join("-vs-")}${DB_LATENCY_MS ? `-${DB_LATENCY_MS}ms-db` : ""}.json`,
		import.meta.url,
	),
	`${JSON.stringify(results, null, 2)}\n`,
);
const transpose = (table: Record<string, Record<string, number>>) =>
	Object.fromEntries(
		Object.keys(table[builds[0] ?? ""] ?? {}).map((name) => [
			name,
			Object.fromEntries(builds.map((build) => [build, table[build]?.[name]])),
		]),
	);
console.log("Best of", RUNS);
console.table(transpose(best));
console.log("Median of", RUNS);
console.table(transpose(medians));
if (builds.length > 1) {
	console.log("Paired change, median over runs (%)");
	console.table(
		Object.fromEntries(
			Object.keys(Object.values(pairedChange)[0] ?? {}).map((name) => [
				name,
				Object.fromEntries(
					Object.entries(pairedChange).map(([pair, values]) => [pair, values[name]]),
				),
			]),
		),
	);
}
if (pageErrors.size > 0) console.error("Page errors:", [...pageErrors]);
