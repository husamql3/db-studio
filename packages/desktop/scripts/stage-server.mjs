// Builds `server-stage/server/`: the server CLI bundle plus a production install of its runtime
// dependencies. Packaged into `resources/server` by electron-builder (see electron-builder.yml
// `extraResources`). The extra nesting matters: electron-builder silently drops a top-level
// `node_modules` from any copied folder, but keeps nested ones. better-sqlite3 ships N-API
// prebuilds for every platform, so no Electron-ABI rebuild is needed.
//
//   node scripts/stage-server.mjs
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = path.resolve(desktopDir, "../server");
const stageRoot = path.join(desktopDir, "server-stage");
const stageDir = path.join(stageRoot, "server");

const serverDist = path.join(serverDir, "dist");
if (
	!existsSync(path.join(serverDist, "index.js")) ||
	!existsSync(path.join(serverDist, "web-dist"))
) {
	console.error("packages/server/dist is missing. Run `bun run build:server` first.");
	process.exit(1);
}

const serverPkg = JSON.parse(readFileSync(path.join(serverDir, "package.json"), "utf8"));

rmSync(stageRoot, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });
cpSync(serverDist, stageDir, { recursive: true });
writeFileSync(
	path.join(stageDir, "package.json"),
	JSON.stringify(
		{
			name: "db-studio-server-stage",
			private: true,
			version: serverPkg.version,
			type: "module",
			dependencies: serverPkg.dependencies,
		},
		null,
		2,
	),
);

console.log("Installing server runtime dependencies...");
execFileSync(
	"npm",
	[
		"install",
		"--omit=dev",
		"--no-audit",
		"--no-fund",
		"--no-package-lock",
		"--ignore-scripts",
	],
	{ cwd: stageDir, stdio: "inherit", shell: process.platform === "win32" },
);
console.log(`✓ Staged server into ${path.relative(desktopDir, stageDir)}`);
