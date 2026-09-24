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
			// No thresholds by design. Coverage is reported, never ratcheted — a coverage floor
			// only ever gets met by writing the mock-heavy tests AGENTS.md forbids. Feature
			// verification lives in E2E runs and their artifacts.
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
