import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import mdx from "fumadocs-mdx/vite";
import { defineConfig, type Plugin } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";
import * as MdxConfig from "./source.config";

// Exposes the raw text of content/docs/*.mdx as `virtual:raw-docs`
// (a `?raw` glob import doesn't work here — the fumadocs-mdx plugin
// compiles .mdx modules regardless of the query). Used by the markdown
// content negotiation in src/server.ts.
const rawDocs = (): Plugin => {
	const virtualId = "virtual:raw-docs";
	const resolvedId = `\0${virtualId}`;
	const docsDirectory = join(import.meta.dirname, "content/docs");
	return {
		name: "raw-docs",
		resolveId(id) {
			if (id === virtualId) return resolvedId;
		},
		load(id) {
			if (id !== resolvedId) return;
			const files = readdirSync(docsDirectory).filter((file) => file.endsWith(".mdx"));
			for (const file of files) this.addWatchFile(join(docsDirectory, file));
			const docs = Object.fromEntries(
				files.map((file) => [
					file.replace(/\.mdx$/, ""),
					readFileSync(join(docsDirectory, file), "utf8"),
				]),
			);
			return `export default ${JSON.stringify(docs)}`;
		},
		hotUpdate({ file, server }) {
			if (!file.startsWith(`${docsDirectory}/`) || !file.endsWith(".mdx")) return;
			const module = server.moduleGraph.getModuleById(resolvedId);
			if (!module) return;
			server.moduleGraph.invalidateModule(module);
			return [module];
		},
	};
};

const config = defineConfig({
	plugins: [
		cloudflare({ viteEnvironment: { name: "ssr" } }),
		devtools(),
		viteTsConfigPaths({
			projects: ["./tsconfig.json"],
		}),
		tailwindcss(),
		rawDocs(),
		tanstackStart(),
		viteReact(),
		mdx(MdxConfig),
	],
});

export default config;
