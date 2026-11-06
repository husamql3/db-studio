import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { type AddressInfo, createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { DATABASE_ENGINES, type DatabaseTypeSchema } from "@db-studio/shared/types";
import { z } from "zod";
import { urlDbType } from "../src/connection-url.js";

// Every script runs before the server code is imported, so nothing it starts reports telemetry.
process.env.DB_STUDIO_TELEMETRY = "0";

export const ARTIFACTS_DIR = fileURLToPath(new URL("./artifacts/", import.meta.url));

/** Writes `data` to e2e/artifacts/<name>: a string as is, anything else as indented JSON. */
export const writeArtifact = async (name: string, data: unknown) => {
	const file = path.join(ARTIFACTS_DIR, name);
	await mkdir(path.dirname(file), { recursive: true });
	await writeFile(
		file,
		typeof data === "string" ? data : `${JSON.stringify(data, null, 2)}\n`,
	);

	return file;
};

/** `DATABASE_URL`, refused unless it names one of `engines` (any engine when none are given). */
export const requireDatabaseUrl = (...engines: DatabaseTypeSchema[]) => {
	const url = process.env.DATABASE_URL ?? "";
	const dbType = url ? urlDbType(url) : undefined;

	if (!dbType || (engines.length && !engines.includes(dbType))) {
		const names = engines.map((engine) => DATABASE_ENGINES[engine].label).join(" or ");
		throw new Error(`Set DATABASE_URL to a disposable ${names || "database"} URL`);
	}

	return { url, dbType };
};

/** The database a server URL names in its path. */
export const databaseName = (url: string) =>
	decodeURIComponent(new URL(url).pathname.slice(1));

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/**
 * Makes `value` repeatable: object keys sorted, the values under `keys` replaced by `<key>`, and
 * each `replace` pattern in every string replaced (a RegExp must be global).
 */
export const normalize = (
	value: unknown,
	options: { keys?: string[]; replace?: [string | RegExp, string][] } = {},
	key?: string,
): Json => {
	if (value === null || value === undefined) return null;

	if (key && options.keys?.includes(key)) return `<${key}>`;

	if (Array.isArray(value)) return value.map((item) => normalize(item, options));

	if (value instanceof Date) return value.toISOString();

	if (typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value)
				.toSorted(([a], [b]) => (a < b ? -1 : 1))
				.map(([k, item]) => [k, normalize(item, options, k)]),
		);
	}

	if (typeof value === "string") {
		return (options.replace ?? []).reduce<string>(
			(text, [pattern, replacement]) => text.replaceAll(pattern, replacement),
			value,
		);
	}

	if (typeof value === "number" || typeof value === "boolean") return value;

	return String(value);
};

/** `replace` entries that hide a connection URL, with and without its scheme. */
export const redactUrl = (url: string): [string, string][] => [
	[url, "<redacted>"],
	[url.replace(/^[a-z0-9+]+:\/\//i, ""), "<redacted>"],
];

export const assert: (condition: unknown, message: string) => asserts condition = (
	condition,
	message,
) => {
	if (!condition) throw new Error(message);
};

/** Asserts that `actual` and `expected` serialize to the same JSON. */
export const assertEqual = (actual: unknown, expected: unknown, label: string) => {
	const a = JSON.stringify(actual);
	const e = JSON.stringify(expected);
	assert(a === e, `${label}: expected ${e}, got ${a}`);
};

/**
 * A script's tally: `report` prints PASS, or FAIL with the error, for one check and returns
 * whether it passed; `finish` prints the totals and exits, non-zero when any check failed.
 */
export const checks = () => {
	let passed = 0;
	let failed = 0;

	return {
		report: (name: string, error?: string) => {
			if (error === undefined) passed++;
			else failed++;
			console.log(
				`${error === undefined ? "PASS" : "FAIL"}  ${name}${error ? `  -- ${error}` : ""}`,
			);

			return error === undefined;
		},
		finish: (artifactPath?: string): never => {
			const where = artifactPath ? ` -> ${path.relative(process.cwd(), artifactPath)}` : "";
			console.log(`${failed ? "FAIL" : "PASS"}  ${passed}/${passed + failed} checks${where}`);
			process.exit(failed ? 1 : 0);
		},
	};
};

export type ApiResponse = { status: number; body: unknown };

const currentSchema = z.object({ data: z.object({ db: z.string() }) });

const rowsSchema = z.object({
	data: z.object({ rows: z.array(z.record(z.string(), z.unknown())) }),
});

/** The JSON body, or the text when it is not JSON. */
const parseBody = async (response: Response): Promise<Json> => {
	const text = await response.text();

	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};

/**
 * Opens `url` the way the server opens `--database-url` and serves the real app in-process
 * (`app.handle`, no port). `call` and `query` go to this engine's routes with `db` set to the
 * connected database; `request` takes a full `/api/...` path.
 */
export const inProcessApp = async (url = requireDatabaseUrl().url) => {
	const { closeAllConnections, createConnection, registerConnection } =
		await import("../src/open-connections.js");

	const connection = createConnection(url);
	registerConnection("e2e", connection);

	const { createServer } = await import("../src/app.js");
	const { app } = createServer();
	const { dbType } = connection;

	const request = async (
		method: string,
		pathname: string,
		body?: unknown,
	): Promise<ApiResponse> => {
		const response = await app.handle(
			new Request(new URL(pathname, "http://localhost"), {
				method,
				headers: body === undefined ? {} : { "Content-Type": "application/json" },
				body: body === undefined ? undefined : JSON.stringify(body),
			}),
		);

		return { status: response.status, body: await parseBody(response) };
	};

	const current = await request("GET", "/api/databases/current");
	const opened = currentSchema.safeParse(current.body);

	if (!opened.success) {
		throw new Error(`Could not open DATABASE_URL: ${JSON.stringify(current.body)}`);
	}

	const { db } = opened.data.data;

	const call = (method: string, route: string, body?: unknown) => {
		const target = new URL(`/api/${dbType}${route}`, "http://localhost");

		if (!target.searchParams.has("db")) target.searchParams.set("db", db);

		return request(method, `${target.pathname}${target.search}`, body);
	};

	/** Runs `sql` in the query runner and returns its rows; throws unless it answers 200. */
	const query = async (sql: string) => {
		const { status, body } = await call("POST", "/query", { query: sql });

		if (status !== 200) throw new Error(`${sql}: ${status} ${JSON.stringify(body)}`);

		return rowsSchema.parse(body).data.rows;
	};

	return { app, dbType, db, request, call, query, close: closeAllConnections };
};

/** The built CLI: dist/, or the snapshot e2e/artifacts/builds/<build>/. */
export const cliPath = (build?: string) =>
	fileURLToPath(
		new URL(
			build ? `./artifacts/builds/${build}/index.js` : "../dist/index.js",
			import.meta.url,
		),
	);

/** A port nothing listens on right now, so scripts running side by side never share one. */
export const freePort = () =>
	new Promise<number>((resolve, reject) => {
		const server = createNetServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			// SAFETY: a TCP server listening on a host and port has an AddressInfo address.
			const { port } = server.address() as AddressInfo;
			server.close(() => resolve(port));
		});
	});

const children = new Set<ChildProcess>();

// Also stops servers when a setup step throws before a script's own cleanup.
process.once("exit", () => {
	for (const child of children) child.kill("SIGKILL");
});

/**
 * Starts the built CLI on `port` (a free one by default) and resolves once `readyPath` answers
 * 200. It runs in a temporary directory, so a developer's .env is not picked up.
 */
export const startCli = async ({
	cli = cliPath(),
	args = [],
	env = {},
	cwd = tmpdir(),
	port,
	readyPath = "/api/databases",
}: {
	cli?: string;
	args?: string[];
	env?: Record<string, string | undefined>;
	cwd?: string;
	port?: number;
	readyPath?: string;
} = {}) => {
	const listenPort = port ?? (await freePort());
	const base = `http://127.0.0.1:${listenPort}`;

	const child = spawn("node", [cli, "--no-open", "-p", String(listenPort), ...args], {
		cwd,
		env: {
			...process.env,
			NODE_ENV: "production",
			DB_STUDIO_TELEMETRY: "0",
			HOST: "127.0.0.1",
			...env,
		},
		stdio: ["ignore", "ignore", "pipe"],
	});

	children.add(child);
	const exited = new Promise<number | null>((resolve) => child.once("exit", resolve));
	void exited.then(() => children.delete(child));

	let stderr = "";
	child.stderr?.on("data", (chunk) => {
		stderr = (stderr + chunk).slice(-2000);
	});

	const deadline = Date.now() + 30_000;

	for (;;) {
		if (child.exitCode !== null)
			throw new Error(`server exited with ${child.exitCode}: ${stderr}`);

		if (Date.now() > deadline) {
			child.kill("SIGKILL");
			throw new Error(`server not ready after 30s: ${stderr}`);
		}

		const ready = await fetch(`${base}${readyPath}`).then(
			(response) => response.ok,
			() => false,
		);

		if (ready) return { child, base, port: listenPort, exited };
		await sleep(5);
	}
};

export const launchBrowser = async () => {
	const { chromium } = await import("playwright-core");

	return chromium.launch({
		channel: process.env.PERF_BROWSER_CHANNEL ?? "chrome",
		headless: true,
	});
};
