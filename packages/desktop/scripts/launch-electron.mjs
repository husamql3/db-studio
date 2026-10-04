import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronBinary = require("electron");

const env = { ...process.env };
// Set when a parent runs under Electron-as-Node; it would turn our app into a plain Node process.
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBinary, [desktopDir], { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) {
	process.on(signal, () => child.kill(signal));
}
