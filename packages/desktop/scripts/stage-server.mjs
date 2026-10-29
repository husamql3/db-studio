// Builds `server-stage/server/`: the server CLI bundle plus a production install of its runtime
// dependencies. Packaged into `resources/server` by electron-builder (see electron-builder.yml
// `extraResources`). The extra nesting matters: electron-builder silently drops a top-level
// `node_modules` from any copied folder, but keeps nested ones. The native deps (@libsql/*,
// @duckdb/node-bindings-*) are per-platform optional packages with N-API prebuilds, so no
// Electron-ABI rebuild is needed, but npm must pick the ones for the target, not the host:
// macOS x64 is built on an arm64 runner.
//
//   node scripts/stage-server.mjs [--arch x64]
import { execFileSync, spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = path.resolve(desktopDir, "../server");
const stageRoot = path.join(desktopDir, "server-stage");
const stageDir = path.join(stageRoot, "server");
const archFlag = process.argv.indexOf("--arch");
const arch = archFlag === -1 ? process.arch : process.argv[archFlag + 1];

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

console.log(`Installing server runtime dependencies for ${process.platform}-${arch}...`);
execFileSync(
	"npm",
	[
		"install",
		"--omit=dev",
		"--no-audit",
		"--no-fund",
		"--no-package-lock",
		"--ignore-scripts",
		`--cpu=${arch}`,
		`--os=${process.platform}`,
	],
	{ cwd: stageDir, stdio: "inherit", shell: process.platform === "win32" },
);

// DuckDB's macOS package ships a universal libduckdb.dylib; keep only the target slice.
if (process.platform === "darwin") {
	const slice = arch === "x64" ? "x86_64" : arch;
	for (const file of readdirSync(stageDir, { recursive: true })) {
		if (!/\.(dylib|node)$/.test(file)) continue;
		const binary = path.join(stageDir, file);
		// Empty for the other platforms' prebuilds oracledb ships, which are not Mach-O.
		const archs = spawnSync("lipo", ["-archs", binary], { encoding: "utf8" }).stdout.trim();
		if (archs.includes(" ")) execFileSync("lipo", ["-thin", slice, binary, "-output", binary]);
	}
}
console.log(`✓ Staged server into ${path.relative(desktopDir, stageDir)}`);
