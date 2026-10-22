import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

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

const get = async (pathname: string) => {
	const response = await app.handle(new Request(new URL(pathname, "http://localhost")));
	return { status: response.status, body: await response.text() };
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
	assert.equal((evidence.unknownApi as { status: number }).status, 404);
	console.log("PASS a missing web build answers 404 with build instructions");
} finally {
	await mkdir(new URL("./artifacts/", import.meta.url), { recursive: true });
	await writeFile(
		new URL("./artifacts/missing-web-build.json", import.meta.url),
		`${JSON.stringify(evidence, null, 2)}\n`,
	);
}
