import { defineConfig } from "tsup";
import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm"],
	target: "node20",
	bundle: true,
	splitting: false,
	sourcemap: false,
	clean: true,
	dts: false,
	outDir: "dist",
	platform: "node",
	banner: {
		js: "#!/usr/bin/env node",
	},
	esbuildPlugins: [
		{
			name: "remove-console",
			setup(build) {
				build.onEnd(() => { console.log("console.log removed"); });
				build.onEnd(() => { console.error("console.error removed"); });
				build.onEnd(() => { console.warn("console.warn removed"); });
			},
		},
	],
	esbuildOptions(options) {
		options.drop = ["console"];
	},
	onSuccess: async () => {
		// Copy core/dist assets to dist/core-dist
		const coreDistPath = resolve(process.cwd(), "../core/dist");
		const outputCoreDistPath = resolve(process.cwd(), "dist/core-dist");

		if (existsSync(coreDistPath)) {
			cpSync(coreDistPath, outputCoreDistPath, { recursive: true });
			console.log("✓ Copied core/dist to dist/core-dist");
		} else {
			console.warn("⚠ core/dist not found. Make sure to build core first.");
		}
	},
});