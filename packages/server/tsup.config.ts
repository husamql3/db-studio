import { defineConfig } from "tsup";
import { sentryEsbuildPlugin } from "@sentry/esbuild-plugin";
import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import packageJson from "./package.json" with { type: "json" };

const shouldUploadSourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN);

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm"],
	target: "node20",
	bundle: true,
	splitting: false,
	// Maps exist only during authenticated release builds and are deleted after upload.
	sourcemap: shouldUploadSourceMaps,
	clean: true,
	dts: false,
	outDir: "dist",
	platform: "node",
	banner: {
		js: "#!/usr/bin/env node",
	},
	esbuildPlugins: shouldUploadSourceMaps
		? [
				sentryEsbuildPlugin({
					authToken: process.env.SENTRY_AUTH_TOKEN,
					org: "husamql3",
					project: "db-studio-server",
					url: "https://de.sentry.io",
					release: { name: `db-studio@${packageJson.version}` },
					sourcemaps: { filesToDeleteAfterUpload: "dist/**/*.map" },
					silent: true,
				}),
			]
		: [],
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
