import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Regression for DB-STUDIO-SERVER-G: a server started from a checkout whose web app was never
// built (no index.html where getWebDistPath looks) answered every page with 500 ENOENT and
// reported each one to Sentry. It must answer 404 and say how to build the web app, while the
// API keeps working.
process.env.DB_STUDIO_TELEMETRY = "0";
// getWebDistPath falls back to <cwd>/../web/dist; an empty temp directory has none.
process.chdir(await mkdtemp(path.join(tmpdir(), "dbstudio-e2e-")));
const { createServer } = await import("../src/utils/create-server.js");
const { app } = createServer();
const evidence: Record<string, unknown> = {};

// A failing run captures the error body; keep the artifact free of machine paths and request IDs.
const serverDir = fileURLToPath(new URL("../", import.meta.url));
const get = async (pathname: string) => {
	const response = await app.handle(new Request(new URL(pathname, "http://localhost")));
	const body = (await response.text())
		.replaceAll(serverDir, "<server>/")
		.replace(/"requestId":"[^"]*"/, '"requestId":"<id>"');
	return { status: response.status, contentType: response.headers.get("content-type"), body };
};

try {
	evidence.root = await get("/");
	evidence.clientRoute = await get("/table/device_keys");
	evidence.unknownApi = await get("/api/does-not-exist");

	for (const label of ["root", "clientRoute"]) {
		const { status, body } = evidence[label] as { status: number; body: string };
		assert.equal(status, 404, `${label}: ${body}`);
		assert.match(body, /bun run build/, `${label}: ${body}`);
	}
	// The API keeps its JSON 404 instead of getting the plain-text build instructions.
	const unknownApi = evidence.unknownApi as {
		status: number;
		contentType: string;
		body: string;
	};
	assert.equal(unknownApi.status, 404);
	assert.match(unknownApi.contentType, /^application\/json/);
	assert.deepEqual(JSON.parse(unknownApi.body), { error: "Not found" });
	console.log("PASS a missing web build answers 404 with build instructions");
} finally {
	await mkdir(new URL("./artifacts/", import.meta.url), { recursive: true });
	await writeFile(
		new URL("./artifacts/missing-web-build.json", import.meta.url),
		`${JSON.stringify(evidence, null, 2)}\n`,
	);
}
