import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.test.ts", "src/index.ts", "src/cmd/**"],
			// Floor of measured coverage per #276 — raise with new tests, never lower to green.
			thresholds: {
				lines: 76,
				branches: 64,
				functions: 72,
				statements: 74,
			},
		},
		setupFiles: ["./tests/setup.ts"],
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"@db-studio/shared": path.resolve(__dirname, "../shared/src"),
		},
	},
});
