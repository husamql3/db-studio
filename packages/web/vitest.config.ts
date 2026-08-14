import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	test: {
		globals: true,
		environment: "happy-dom",
		include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
		setupFiles: ["./tests/setup.ts"],
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"@db-studio/shared": path.resolve(__dirname, "../shared/src"),
		},
	},
});
