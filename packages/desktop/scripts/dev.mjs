// Desktop dev loop: bundle main/preload in watch mode and (re)launch Electron on each rebuild.
// Uses the web Vite dev server at VITE_DEV_SERVER_URL (default http://localhost:3001) and
// starts one itself when nothing is listening there. The server CLI must be built already
// (turbo does this via the `db-studio#build` dependency).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.resolve(desktopDir, "../web");
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:3001";
const devServer = new URL(devServerUrl);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const children = [];

if (!existsSync(path.resolve(desktopDir, "../server/dist/index.js"))) {
	console.error("packages/server/dist is missing. Run `bun run build:server` first.");
	process.exit(1);
}

const isReachable = () =>
	fetch(devServer).then(
		() => true,
		() => false,
	);

const shutdown = (code = 0) => {
	for (const child of children) child.kill();
	process.exit(code);
};
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => shutdown(0));

if (!(await isReachable())) {
	if (process.env.VITE_DEV_SERVER_URL) {
		console.error(`No Vite dev server at ${devServerUrl} (VITE_DEV_SERVER_URL).`);
		process.exit(1);
	}
	console.log(`Starting the web dev server on ${devServerUrl}...`);
	const vite = spawn("bun", ["run", "dev:app"], {
		cwd: webDir,
		stdio: "inherit",
		shell: process.platform === "win32",
		env: { ...process.env, PORT: devServer.port },
	});
	vite.on("exit", (code) => {
		console.error(`Web dev server exited with code ${code}`);
		shutdown(code ?? 1);
	});
	children.push(vite);

	const deadline = Date.now() + 60_000;
	while (!(await isReachable())) {
		if (Date.now() > deadline) {
			console.error(`Timed out waiting for the web dev server at ${devServerUrl}`);
			shutdown(1);
		}
		await sleep(500);
	}
}

const ensure = spawn(
	process.execPath,
	[path.join(desktopDir, "scripts/ensure-electron.mjs")],
	{
		stdio: "inherit",
	},
);
await new Promise((resolve) => ensure.on("exit", resolve)).then((code) => {
	if (code !== 0) shutdown(code ?? 1);
});

const tsup = spawn(
	"npx",
	[
		"tsup",
		"--watch",
		"--onSuccess",
		`node ${path.join(desktopDir, "scripts/launch-electron.mjs")}`,
	],
	{
		cwd: desktopDir,
		stdio: "inherit",
		shell: process.platform === "win32",
		env: { ...process.env, VITE_DEV_SERVER_URL: devServerUrl },
	},
);
children.push(tsup);
tsup.on("exit", (code) => shutdown(code ?? 0));
