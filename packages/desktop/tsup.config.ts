import { defineConfig, type Options } from "tsup";

// Every JS dependency is inlined; only Electron itself stays external. The packaged app
// therefore ships no node_modules of its own, which sidesteps Bun's isolated linker layout.
// The server child gets its own staged production install (see scripts/stage-server.mjs).
const shared: Options = {
	format: ["cjs"],
	outDir: "dist-electron",
	outExtension: () => ({ js: ".cjs" }),
	platform: "node",
	target: "node22",
	external: ["electron"],
	splitting: false,
	sourcemap: true,
	dts: false,
};

export default defineConfig([
	{ ...shared, entry: { main: "src/main.ts" }, clean: true },
	// Sandboxed preloads must be self-contained: no shared chunks, no runtime requires.
	{ ...shared, entry: { preload: "src/preload.ts" }, clean: false },
]);
