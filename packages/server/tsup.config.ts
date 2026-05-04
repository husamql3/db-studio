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
		// Copy web/dist assets to dist/web-dist
		const webDistPath = resolve(process.cwd(), "../web/dist");
		const outputWebDistPath = resolve(process.cwd(), "dist/web-dist");

		if (existsSync(webDistPath)) {
			cpSync(webDistPath, outputWebDistPath, { recursive: true });
			console.log("✓ Copied web/dist to dist/web-dist");
		} else {
			console.warn("⚠ web/dist not found. Make sure to build the web app first.");
		}
	},
});
