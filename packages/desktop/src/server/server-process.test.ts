import type { ChildProcess } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { ServerProcess } from "./server-process";

// Failure modes, each against a real child process:
// 1. Two overlapping connects both spawn a server; one child is orphaned and keeps running.
// 2. A missing executable never emits "exit", so startup hangs until the 20s ready timeout.
// 3. The decrypted URL (with its password) is visible to any local `ps` via the child's argv.

const spawned = vi.hoisted(() => [] as ChildProcess[]);

vi.mock("node:child_process", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:child_process")>();
	return {
		...actual,
		spawn: (...args: Parameters<typeof actual.spawn>) => {
			const child = actual.spawn(...args);
			spawned.push(child);
			return child;
		},
	};
});

vi.mock("electron", () => ({ app: { getPath: () => tmpdir() } }));

vi.mock("../env", () => {
	const serverDir = path.join(import.meta.dirname, "fixtures");
	return {
		isDev: true,
		serverDir,
		serverEntry: path.join(serverDir, "fake-server.mjs"),
		rendererOrigin: "dbstudio://app",
	};
});

const log = { info: () => {}, warn: () => {}, error: () => {}, file: "" };
const URL_WITH_SECRET = "postgres://admin:hunter2@db.internal:5432/app";
const isAlive = (child: ChildProcess) => child.exitCode === null && child.signalCode === null;

let server: ServerProcess;

afterEach(async () => {
	await server.stop();
	for (const child of spawned.splice(0)) child.kill("SIGKILL");
	vi.unstubAllEnvs();
});

it("leaves exactly one server running after overlapping connects", async () => {
	server = new ServerProcess(log);

	await Promise.all([server.start("a", URL_WITH_SECRET), server.start("b", URL_WITH_SECRET)]);

	expect(server.status).toMatchObject({ state: "running", connectionId: "b" });
	expect(spawned.filter(isAlive)).toHaveLength(1);
});

it("fails fast when the server executable cannot be launched", async () => {
	vi.stubEnv("DB_STUDIO_DESKTOP_NODE", "/nonexistent/node");
	server = new ServerProcess(log);

	const status = await server.start("a", URL_WITH_SECRET);

	expect(status).toMatchObject({ state: "error", message: expect.stringMatching(/ENOENT/) });
}, 3_000);

it("keeps the connection URL out of the child's command line", async () => {
	server = new ServerProcess(log);

	await server.start("a", URL_WITH_SECRET);

	expect(server.status.state).toBe("running");
	expect(spawned[0]?.spawnargs.join(" ")).not.toContain("hunter2");
});
