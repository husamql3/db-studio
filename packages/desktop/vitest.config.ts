import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
	resolve: {
		alias: {
			"@db-studio/shared": path.resolve(import.meta.dirname, "../shared/src"),
		},
	},
});
