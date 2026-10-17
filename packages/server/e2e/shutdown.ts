/**
 * Stopping the built CLI with Ctrl+C (SIGINT) or SIGTERM. The process used to stay alive for
 * 30 s after either signal, until the PostgreSQL pool's idle connections timed out.
 *
 * Failure modes it covers:
 * - the process outlives the signal by the pool's idle timeout;
 * - a request in flight when the signal arrives is cut off instead of answered;
 * - the process exits with an error code.
 *
 *   DATABASE_URL=postgresql://dbstudio:dbstudio@127.0.0.1:5434/dbstudio \
 *     bunx tsx e2e/shutdown.ts [build]
 *
 * [build] names a snapshot in e2e/artifacts/builds/ and defaults to dist/. Nothing is written to
 * the database. Writes e2e/artifacts/shutdown-<build>.json.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.startsWith("postgresql://")) {
	throw new Error("Set DATABASE_URL to a PostgreSQL database");
}
const db = new URL(databaseUrl).pathname.slice(1);
const build = process.argv[2];
const cli = fileURLToPath(
	new URL(
		build ? `./artifacts/builds/${build}/index.js` : "../dist/index.js",
		import.meta.url,
	),
);
const PORT = 4525;
const BASE = `http://127.0.0.1:${PORT}`;
const EXIT_WITHIN_MS = 5_000;

const stopWith = async (signal: NodeJS.Signals) => {
	const server = spawn("node", [cli, "--no-open", "-p", String(PORT), "-d", databaseUrl], {
		cwd: tmpdir(),
		env: {
			...process.env,
			NODE_ENV: "production",
			DB_STUDIO_TELEMETRY: "0",
			HOST: "127.0.0.1",
		},
		stdio: "ignore",
	});
	const exited = new Promise<number | null>((resolve) => server.on("exit", resolve));
	for (;;) {
		if (server.exitCode !== null) throw new Error(`server exited with ${server.exitCode}`);
		const ready = await fetch(`${BASE}/api/databases`)
			.then((response) => response.ok)
			.catch(() => false);
		if (ready) break;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}

	// A query that takes a second, so it is still running when the signal arrives.
	const inFlight = fetch(`${BASE}/api/pg/query?db=${encodeURIComponent(db)}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ query: "SELECT pg_sleep(1) AS slept" }),
	}).then(
		(response) => response.status,
		(error: Error) => error.message,
	);
	await new Promise((resolve) => setTimeout(resolve, 300));
	const signalledAt = performance.now();
	server.kill(signal);

	const inFlightStatus = await inFlight;
	const exitCode = await Promise.race([
		exited,
		new Promise<"still running">((resolve) =>
			setTimeout(() => resolve("still running"), EXIT_WITHIN_MS),
		),
	]);
	const exitedWithin5s = exitCode !== "still running";
	console.log(
		`${signal}: in-flight request ${inFlightStatus}, ${
			exitedWithin5s
				? `exited with ${exitCode} after ${Math.round(performance.now() - signalledAt)} ms`
				: `still running after ${EXIT_WITHIN_MS} ms`
		}`,
	);
	if (!exitedWithin5s) {
		server.kill("SIGKILL");
		await exited;
	}
	return {
		signal,
		inFlightStatus,
		exitedWithin5s,
		exitCode: exitedWithin5s ? exitCode : null,
	};
};

const results = [await stopWith("SIGINT"), await stopWith("SIGTERM")];
await writeFile(
	new URL(`./artifacts/shutdown-${build ?? "dist"}.json`, import.meta.url),
	`${JSON.stringify(results, null, 2)}\n`,
);
for (const result of results) {
	assert.deepEqual(result, {
		signal: result.signal,
		inFlightStatus: 200,
		exitedWithin5s: true,
		exitCode: 0,
	});
}
console.log("PASS shutdown");
