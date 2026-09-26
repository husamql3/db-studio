// `bun install --ignore-scripts` (CI) skips Electron's postinstall, which downloads the binary.
// Run the installer ourselves when the binary is missing.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const electronDir = path.dirname(require.resolve("electron/package.json"));

if (!existsSync(path.join(electronDir, "path.txt"))) {
	console.log("Electron binary missing, downloading...");
	execFileSync(process.execPath, [path.join(electronDir, "install.js")], { stdio: "inherit" });
}
