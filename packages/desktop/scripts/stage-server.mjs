// Builds `server-stage/server/`: the server CLI with its JS dependencies bundled into index.js,
// plus the per-platform native packages that bundle loads at runtime. Packaged into `resources/server` by electron-builder (see electron-builder.yml
// `extraResources`). The extra nesting matters: electron-builder silently drops a top-level
// `node_modules` from any copied folder, but keeps nested ones. The native deps (@libsql/*,
// @duckdb/node-bindings-*) are per-platform optional packages with N-API prebuilds, so no
// Electron-ABI rebuild is needed, but npm must pick the ones for the target, not the host:
// macOS x64 is built on an arm64 runner.
//
//   node scripts/stage-server.mjs [--arch x64]
import { execFileSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

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

// The installed packages hold ~190 MB of JS (types, maps, dual builds, unused code) that a
// bundle does not need. Native addons stay external and resolve from node_modules at runtime.
const entry = path.join(stageDir, "index.js");
await build({
	entryPoints: [entry],
	outfile: entry,
	allowOverwrite: true,
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node22",
	external: ["*.node"],
	logLevel: "error",
	// CJS dependencies call require() and read __dirname, which an ES module does not define.
	banner: {
		js: [
			'import { createRequire as __createRequire } from "node:module";',
			'import { dirname as __pathDirname } from "node:path";',
			'import { fileURLToPath as __fileURLToPath } from "node:url";',
			"const require = __createRequire(import.meta.url);",
			"const __filename = __fileURLToPath(import.meta.url);",
			"const __dirname = __pathDirname(__filename);",
		].join("\n"),
	},
});

// Keep only the single-platform prebuild packages (DuckDB, libSQL), which the bundle requires
// by computed names.
const nodeModules = path.join(stageDir, "node_modules");
const installed = `${nodeModules}-installed`;
renameSync(nodeModules, installed);
const packages = readdirSync(installed)
	.filter((name) => !name.startsWith("."))
	.flatMap((name) =>
		name.startsWith("@")
			? readdirSync(path.join(installed, name)).map((n) => `${name}/${n}`)
			: [name],
	);
for (const name of packages) {
	const manifest = JSON.parse(
		readFileSync(path.join(installed, name, "package.json"), "utf8"),
	);
	if (manifest.os?.length !== 1) continue;
	mkdirSync(path.dirname(path.join(nodeModules, name)), { recursive: true });
	renameSync(path.join(installed, name), path.join(nodeModules, name));
}
rmSync(installed, { recursive: true, force: true });

// DuckDB's macOS package ships a universal libduckdb.dylib with its local symbols; keep only
// the target slice and drop those symbols. Stripping voids DuckDB's signature, so re-sign ad hoc.
if (process.platform === "darwin") {
	const slice = arch === "x64" ? "x86_64" : arch;
	for (const file of readdirSync(nodeModules, { recursive: true })) {
		if (!/\.(dylib|node)$/.test(file)) continue;
		const binary = path.join(nodeModules, file);
		const archs = execFileSync("lipo", ["-archs", binary], { encoding: "utf8" }).trim();
		if (archs.includes(" ")) execFileSync("lipo", ["-thin", slice, binary, "-output", binary]);
		execFileSync("strip", ["-x", binary], { stdio: "ignore" });
		execFileSync("codesign", ["--force", "--sign", "-", binary]);
	}
}
console.log(`✓ Staged server into ${path.relative(desktopDir, stageDir)}`);
