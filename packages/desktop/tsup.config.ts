import { defineConfig } from "tsup";

// Every JS dependency is inlined; only Electron itself stays external. The packaged app
// therefore ships no node_modules of its own, which sidesteps Bun's isolated linker layout.
// The server child gets its own staged production install (see scripts/stage-server.mjs).
export default defineConfig({
	entry: { main: "src/main.ts" },
	format: ["cjs"],
	outDir: "dist-electron",
	outExtension: () => ({ js: ".cjs" }),
	platform: "node",
	target: "node22",
	external: ["electron"],
	sourcemap: true,
	clean: true,
});
