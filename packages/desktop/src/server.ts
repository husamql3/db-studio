import { type ChildProcess, spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { app } from "electron";
import type { Logger } from "./log";

const READY_TIMEOUT_MS = 20_000;
const READY_POLL_MS = 250;
const TAIL_LINES = 10;

const freePort = () =>
	new Promise<number>((resolve, reject) => {
		const probe = createServer();
		probe.on("error", reject);
		probe.listen(0, "127.0.0.1", () => {
			const address = probe.address();
			probe.close(() =>
				typeof address === "object" && address
					? resolve(address.port)
					: reject(new Error("Could not allocate a port")),
			);
		});
	});

/**
 * Starts the server CLI without a database URL; its /connect page takes it from there. Resolves
 * once `GET /` answers. Rejects with the last output lines when the child exits or never answers.
 */
export const startServer = async (
	log: Logger,
): Promise<{ url: string; child: ChildProcess; output: string[] }> => {
	const dev = !app.isPackaged;
	// Dev: cwd must be packages/server, where development mode looks for ../web/dist.
	// Packaged: resources/server, so loadEnv() finds no project .env walking up from the cwd.
	const serverDir = dev
		? path.resolve(__dirname, "../../server")
		: path.join(process.resourcesPath, "server");
	const entry = path.join(serverDir, dev ? "dist/index.js" : "index.js");
	// Dev runs the workspace node_modules, built for the system Node ABI. Packaged runs Electron
	// as Node against the staged install.
	const command = dev ? (process.env.DB_STUDIO_DESKTOP_NODE ?? "node") : process.execPath;
	const port = await freePort();
	const url = `http://127.0.0.1:${port}`;

	const child = spawn(command, [entry], {
		cwd: serverDir,
		stdio: ["ignore", "pipe", "pipe"],
		windowsHide: true,
		env: {
			...process.env,
			ELECTRON_RUN_AS_NODE: "1",
			NODE_ENV: dev ? "development" : "production",
			HOST: "127.0.0.1",
			PORT: String(port),
			FORCE_COLOR: "0",
			// picocolors (the CLI's colors) turns colors on when FORCE_COLOR is set at all.
			NO_COLOR: "1",
		},
	});
	// Registered at spawn so a quit during startup cannot orphan the child.
	app.once("before-quit", () => child.kill());
	log.info("server", `spawned pid ${child.pid} on port ${port}`);

	const output: string[] = [];
	const collect = (chunk: Buffer) => {
		for (const line of chunk.toString().split(/\r?\n/)) {
			if (!line.trim()) continue;
			log.info("server", line);
			output.push(line);
			if (output.length > TAIL_LINES) output.shift();
		}
	};
	child.stdout.on("data", collect);
	child.stderr.on("data", collect);

	const exited = new Promise<never>((_, reject) => {
		child.once("exit", (code) => reject(new Error(`The server exited with code ${code}.`)));
		child.once("error", reject);
	});

	try {
		const deadline = Date.now() + READY_TIMEOUT_MS;
		for (;;) {
			const ready = fetch(`${url}/`, { signal: AbortSignal.timeout(2_000) }).then(
				(response) => response.ok,
				() => false,
			);
			if (await Promise.race([ready, exited])) return { url, child, output };
			if (Date.now() > deadline) throw new Error("The server did not answer within 20 s.");
			await Promise.race([new Promise((r) => setTimeout(r, READY_POLL_MS)), exited]);
		}
	} catch (error) {
		child.kill();
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error([reason, ...output].join("\n"));
	}
};
