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
import { cliPath, databaseName, requireDatabaseUrl, startCli, writeArtifact } from "./lib.js";

const { url: databaseUrl } = requireDatabaseUrl("pg");
const db = databaseName(databaseUrl);
const build = process.argv[2];
const EXIT_WITHIN_MS = 5_000;

const stopWith = async (signal: NodeJS.Signals) => {
	const {
		child: server,
		base: BASE,
		exited,
	} = await startCli({ cli: cliPath(build), args: ["-d", databaseUrl] });

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

await writeArtifact(`shutdown-${build ?? "dist"}.json`, results);

for (const result of results) {
	assert.deepEqual(result, {
		signal: result.signal,
		inFlightStatus: 200,
		exitedWithin5s: true,
		exitCode: 0,
	});
}

console.log("PASS shutdown");
