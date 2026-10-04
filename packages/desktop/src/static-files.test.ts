import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveStaticFile } from "./static-files";

const root = path.resolve("/app/web-dist");
const files = new Set([
	path.join(root, "index.html"),
	path.join(root, "assets", "index-abc.js"),
	path.join(root, "favicon.png"),
]);
const isFile = (file: string) => files.has(file);

describe("resolveStaticFile", () => {
	it("serves existing assets", () => {
		expect(resolveStaticFile(root, "/assets/index-abc.js", isFile)).toBe(
			path.join(root, "assets", "index-abc.js"),
		);
		expect(resolveStaticFile(root, "/favicon.png", isFile)).toBe(
			path.join(root, "favicon.png"),
		);
	});

	it("falls back to index.html for SPA routes", () => {
		expect(resolveStaticFile(root, "/", isFile)).toBe(path.join(root, "index.html"));
		expect(resolveStaticFile(root, "/table/users", isFile)).toBe(
			path.join(root, "index.html"),
		);
		expect(resolveStaticFile(root, "/connections", isFile)).toBe(
			path.join(root, "index.html"),
		);
	});

	it("never escapes the web root", () => {
		const outside = path.resolve("/app/secret.txt");
		const escaping = (file: string) => file === outside || isFile(file);
		expect(resolveStaticFile(root, "/../secret.txt", escaping)).toBe(
			path.join(root, "index.html"),
		);
		expect(resolveStaticFile(root, "/%2e%2e/secret.txt", escaping)).toBe(
			path.join(root, "index.html"),
		);
		expect(resolveStaticFile(root, "/%zz", isFile)).toBe(path.join(root, "index.html"));
	});
});
