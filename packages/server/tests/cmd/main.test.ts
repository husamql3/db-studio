import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULTS } from "@db-studio/shared/constants";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "@/index.js";

// The real CLI runs against a real .env file; only the terminal output and the HTTP listener
// are replaced, so the test sees where the server would listen.
const { listen, cli } = vi.hoisted(() => ({
	listen: vi.fn(),
	cli: { program: undefined as unknown },
}));

// commander keeps parsed options on its module-level program, so each run gets a fresh one.
vi.mock("commander", async (importOriginal) => {
	const commander = await importOriginal<typeof import("commander")>();
	return {
		...commander,
		get program() {
			return cli.program;
		},
	};
});

vi.mock("@clack/prompts", () => ({
	intro: vi.fn(),
	outro: vi.fn(),
	log: { success: vi.fn(), warn: vi.fn(), info: vi.fn() },
	spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
}));

vi.mock("@/app.js", () => ({ createServer: () => ({ app: { listen } }) }));

const initialEnv = { ...process.env };
const initialArgv = process.argv;
let dir: string;

const run = async (env: string, cliArgs: string[] = []) => {
	const envPath = join(dir, ".env");
	writeFileSync(envPath, env);
	process.argv = ["node", "db-studio", "--env", envPath, "--no-open", ...cliArgs];
	const { Command } = await import("commander");
	cli.program = new Command();
	await main();
	return listen.mock.calls.at(-1)?.[0];
};

describe("main configuration resolution", () => {
	beforeEach(() => {
		listen.mockClear();
		dir = mkdtempSync(join(tmpdir(), "db-studio-main-"));
		process.env = { ...initialEnv };
		delete process.env.PORT;
		delete process.env.HOST;
		delete process.env.DATABASE_URL;
	});

	afterEach(() => {
		process.env = { ...initialEnv };
		process.argv = initialArgv;
		rmSync(dir, { recursive: true, force: true });
	});

	it("reads PORT and HOST from .env when not supplied through environment or CLI", async () => {
		expect(await run("PORT=8080\nHOST=127.0.0.2\n")).toMatchObject({
			port: 8080,
			hostname: "127.0.0.2",
		});
	});

	it("prefers the CLI port over .env PORT", async () => {
		expect(await run("PORT=8080\n", ["--port", "9000"])).toMatchObject({ port: 9000 });
	});

	it("prefers environment variables over .env PORT and HOST", async () => {
		process.env.PORT = "7000";
		process.env.HOST = "127.0.0.3";

		expect(await run("PORT=8080\nHOST=127.0.0.2\n")).toMatchObject({
			port: 7000,
			hostname: "127.0.0.3",
		});
	});

	it("falls back to the default PORT and the loopback HOST when not configured", async () => {
		expect(await run("")).toMatchObject({ port: DEFAULTS.PORT, hostname: "127.0.0.1" });
	});
});
