// Stages the server, then runs electron-builder with the version taken from packages/server
// so desktop releases stay in lockstep with the CLI.
//
//   node scripts/package.mjs --mac --arch arm64
//   node scripts/package.mjs --win --arch x64
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const archFlag = args.indexOf("--arch");
const arch = archFlag === -1 ? process.arch : args[archFlag + 1];
// Everything except `--arch <value>` is forwarded to electron-builder (e.g. --mac, --win, --dir).
const forwarded = args.filter((arg, i) => arg !== "--arch" && args[i - 1] !== "--arch");

const { version } = JSON.parse(
	readFileSync(path.resolve(desktopDir, "../server/package.json"), "utf8"),
);

const run = (file, runArgs) =>
	execFileSync(file, runArgs, {
		cwd: desktopDir,
		stdio: "inherit",
		shell: process.platform === "win32",
	});

run(process.execPath, [path.join(desktopDir, "scripts/ensure-electron.mjs")]);
run(process.execPath, [path.join(desktopDir, "scripts/stage-server.mjs")]);
run("npx", [
	"electron-builder",
	...forwarded,
	`--${arch}`,
	"--publish",
	"never",
	`--config.extraMetadata.version=${version}`,
]);
