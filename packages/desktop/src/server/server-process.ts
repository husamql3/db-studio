import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import type { DesktopServerStatus } from "@db-studio/shared/types";
import { app } from "electron";
import { isDev, rendererOrigin, serverDir, serverEntry } from "../env";
import type { Logger } from "../log";
import { getFreePort } from "./free-port";
import { summarizeOutput } from "./redact";

const READY_TIMEOUT_MS = 20_000;
const READY_POLL_MS = 250;
const PROBE_TIMEOUT_MS = 2_000;
const STOP_TIMEOUT_MS = 3_000;
const OUTPUT_TAIL = 30;
const DATABASE_URL_VAR = "DB_STUDIO_DESKTOP_DATABASE_URL";

/**
 * Owns the single server child (`packages/server` CLI). One connection at a time: starting a
 * new one stops the previous child first. Starts and stops run one after another, so
 * overlapping connect/disconnect requests cannot orphan a child. Emits "status" whenever the
 * state changes.
 */
export class ServerProcess extends EventEmitter<{ status: [DesktopServerStatus] }> {
	status: DesktopServerStatus = { state: "idle" };
	private child: ChildProcess | undefined;
	private transition: Promise<unknown> = Promise.resolve();

	constructor(private readonly log: Logger) {
		super();
	}

	get apiBaseUrl(): string | null {
		return this.status.state === "running" ? this.status.apiBaseUrl : null;
	}

	start(connectionId: string, databaseUrl: string): Promise<DesktopServerStatus> {
		return this.serialize(() => this.startNow(connectionId, databaseUrl));
	}

	stop(): Promise<void> {
		return this.serialize(() => this.stopNow());
	}

	private serialize<T>(run: () => Promise<T>): Promise<T> {
		const next = this.transition.then(run);
		this.transition = next.catch(() => {});
		return next;
	}

	private async startNow(
		connectionId: string,
		databaseUrl: string,
	): Promise<DesktopServerStatus> {
		await this.stopNow();
		this.setStatus({ state: "starting", connectionId });

		const port = await getFreePort();
		const apiBaseUrl = `http://127.0.0.1:${port}`;
		const tail: string[] = [];
		const child = this.spawnServer(databaseUrl, port, tail);
		this.child = child;

		// A spawn failure emits "error" and may never emit "exit".
		const exited = new Promise<number | null>((resolve) => {
			child.once("exit", resolve);
			child.once("error", () => resolve(null));
		});
		try {
			await this.waitUntilReady(`${apiBaseUrl}/api/databases`, exited);
			this.setStatus({ state: "running", connectionId, apiBaseUrl });
			void exited.then((code) => {
				if (this.child !== child) return;
				this.child = undefined;
				this.log.warn("server", `child exited unexpectedly with code ${code}`);
				this.setStatus({
					state: "error",
					connectionId,
					message: summarizeOutput(tail) || `Server stopped unexpectedly (code ${code})`,
				});
			});
		} catch (error) {
			child.kill();
			this.child = undefined;
			const message =
				summarizeOutput(tail) || (error instanceof Error ? error.message : String(error));
			this.log.error("server", `failed to start: ${message}`);
			this.setStatus({ state: "error", connectionId, message });
		}
		return this.status;
	}

	private async stopNow(): Promise<void> {
		const child = this.child;
		this.child = undefined;
		if (child && child.exitCode === null && !child.killed) {
			const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
			child.kill();
			const timer = setTimeout(() => child.kill("SIGKILL"), STOP_TIMEOUT_MS);
			await exited;
			clearTimeout(timer);
		}
		if (this.status.state !== "idle") this.setStatus({ state: "idle" });
	}

	/** Best-effort synchronous kill for app quit. */
	killSync(): void {
		this.child?.kill();
		this.child = undefined;
	}

	private spawnServer(databaseUrl: string, port: number, tail: string[]): ChildProcess {
		// Dev: the sibling workspace's node_modules were built for the system Node ABI, so run
		// them with the system Node. Packaged: Electron's own binary in Node mode, against the
		// staged install whose native addons target Electron's ABI.
		const command = isDev ? (process.env.DB_STUDIO_DESKTOP_NODE ?? "node") : process.execPath;
		// The URL goes through the environment, not argv, so `ps` cannot read the password. A
		// dedicated variable name keeps a stray DATABASE_URL in some parent .env from winning.
		const child = spawn(command, [serverEntry, "--var-name", DATABASE_URL_VAR, "--no-open"], {
			cwd: serverDir,
			stdio: ["ignore", "pipe", "pipe"],
			env: {
				...process.env,
				[DATABASE_URL_VAR]: databaseUrl,
				ELECTRON_RUN_AS_NODE: "1",
				NODE_ENV: isDev ? "development" : "production",
				HOST: "127.0.0.1",
				PORT: String(port),
				ALLOWED_ORIGINS: rendererOrigin,
				DB_STUDIO_DATA_DIR: app.getPath("userData"),
				FORCE_COLOR: "0",
			},
		});
		this.log.info("server", `spawned pid ${child.pid} on port ${port}`);

		const collect = (chunk: Buffer) => {
			for (const line of chunk.toString().split(/\r?\n/)) {
				if (!line.trim()) continue;
				tail.push(line);
				if (tail.length > OUTPUT_TAIL) tail.shift();
				this.log.info("server", summarizeOutput([line], 1));
			}
		};
		child.stdout?.on("data", collect);
		child.stderr?.on("data", collect);
		child.on("error", (error) => {
			tail.push(`Failed to launch server: ${error.message}`);
		});
		return child;
	}

	private async waitUntilReady(url: string, exited: Promise<number | null>): Promise<void> {
		const deadline = Date.now() + READY_TIMEOUT_MS;
		let done = false;
		const exit = exited.then((code) => {
			done = true;
			throw new Error(`Server exited before it was ready (code ${code})`);
		});
		while (!done) {
			const probe = fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) }).then(
				(response) => response.ok,
				() => false,
			);
			if (await Promise.race([probe, exit])) return;
			if (Date.now() > deadline) throw new Error("Timed out waiting for the server to start");
			await Promise.race([new Promise((r) => setTimeout(r, READY_POLL_MS)), exit]);
		}
	}

	private setStatus(status: DesktopServerStatus): void {
		this.status = status;
		this.emit("status", status);
	}
}
