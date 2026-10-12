import { mkdir, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Pins the HTTP layer (routing, validation, errors, CORS, request IDs, static files, SPA
 * fallback, chat streaming) of a running server so a framework swap can be diffed old-vs-new.
 * Start the server with DB_STUDIO_PROXY_URL=http://127.0.0.1:4998 and
 * ALLOWED_ORIGINS=https://allowed.example; this script serves the fake AI proxy on 4998.
 * Usage: tsx e2e/http-surface.ts <baseUrl> <label>
 */

const [baseUrl, label] = process.argv.slice(2);
if (!baseUrl || !label) {
	console.error("usage: tsx e2e/http-surface.ts <baseUrl> <label>");
	process.exit(2);
}

const REQUEST_ID = "pin-request-0001";
const DB = "dbstudio";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const RECORDED_HEADERS = [
	"content-type",
	"content-disposition",
	"vary",
	"access-control-allow-origin",
	"access-control-allow-methods",
	"access-control-allow-headers",
	"access-control-expose-headers",
	"access-control-allow-credentials",
	"access-control-max-age",
];

type Probe = {
	name: string;
	method?: string;
	path: string;
	headers?: Record<string, string>;
	body?: unknown;
	rawBody?: string;
	/** Record only the shape of a JSON body whose values depend on database state. */
	shapeOnly?: boolean;
};

const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
const asset = (await readdir(path.join(webDist, "assets"))).sort()[0];

const shape = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.length ? [shape(value[0])] : [];
	if (value && typeof value === "object")
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]));
	return typeof value;
};

const STREAM_GAP_MS = 300;
const fakeProxy = createServer(async (req, res) => {
	if (req.url === "/chat/limit") {
		res.writeHead(200, { "content-type": "application/json" });
		res.end(
			JSON.stringify({
				limit: 10,
				used: 1,
				remaining: 9,
				requestId: req.headers["x-request-id"],
			}),
		);
		return;
	}
	let raw = "";
	for await (const chunk of req) raw += chunk;
	const payload = JSON.parse(raw);
	if (payload.messages[0]?.content === "reject") {
		res.writeHead(401, { "content-type": "application/json" });
		res.end(JSON.stringify({ error: "bad key" }));
		return;
	}
	res.writeHead(200, { "content-type": "text/event-stream" });
	res.write(
		`data: ${JSON.stringify({ provider: payload.provider, model: payload.model, conversationId: payload.conversationId, hasSystemPrompt: typeof payload.systemPrompt === "string", byok: req.headers["x-byok-openai"] })}\n\n`,
	);
	await new Promise((r) => setTimeout(r, STREAM_GAP_MS));
	res.end("data: [DONE]\n\n");
});
await new Promise<void>((resolve) => fakeProxy.listen(4998, "127.0.0.1", resolve));

const chatBody = (content: string) => ({
	provider: "openai",
	messages: [{ id: "m1", role: "user", content }],
	data: { db: DB, conversationId: "c1", includeSchema: false },
});

const probes: Probe[] = [
	{ name: "databases list", path: "/api/databases", shapeOnly: true },
	{ name: "current database", path: "/api/databases/current" },
	{
		name: "drop leftover scratch table",
		method: "POST",
		path: `/api/pg/query?db=${DB}`,
		body: { query: "DROP TABLE IF EXISTS http_pin" },
		shapeOnly: true,
	},
	{
		name: "create scratch table",
		method: "POST",
		path: `/api/pg/query?db=${DB}`,
		body: { query: "CREATE TABLE http_pin (id int primary key, name text)" },
		shapeOnly: true,
	},
	{
		name: "seed scratch table",
		method: "POST",
		path: `/api/pg/query?db=${DB}`,
		body: { query: "INSERT INTO http_pin VALUES (1, 'a'), (2, 'b')" },
		shapeOnly: true,
	},
	{ name: "tables list", path: `/api/pg/tables?db=${DB}`, shapeOnly: true },
	{ name: "tables list trailing slash", path: `/api/pg/tables/?db=${DB}`, shapeOnly: true },
	{ name: "table columns", path: `/api/pg/tables/http_pin/columns?db=${DB}` },
	{ name: "table data", path: `/api/pg/tables/http_pin/data?db=${DB}&limit=1` },
	{
		name: "table data with filters",
		path: `/api/pg/tables/http_pin/data?db=${DB}&filters=${encodeURIComponent(JSON.stringify([{ columnName: "name", operator: "=", value: "b" }]))}&sort=id&order=desc`,
	},
	{ name: "export csv", path: `/api/pg/tables/http_pin/export?db=${DB}&format=csv` },
	{ name: "export json", path: `/api/pg/tables/http_pin/export?db=${DB}&format=json` },
	{
		name: "query select",
		method: "POST",
		path: `/api/pg/query?db=${DB}`,
		body: { query: "SELECT id, name FROM http_pin ORDER BY id" },
	},
	{
		name: "query error",
		method: "POST",
		path: `/api/pg/query?db=${DB}`,
		body: { query: "SELECT * FROM http_pin_missing" },
	},
	{ name: "missing table data", path: `/api/pg/tables/http_pin_missing/data?db=${DB}` },
	{
		name: "add record",
		method: "POST",
		path: `/api/pg/records?db=${DB}`,
		body: { tableName: "http_pin", data: { id: 3, name: "c" } },
	},
	{
		name: "update record",
		method: "PATCH",
		path: `/api/pg/records?db=${DB}`,
		body: {
			tableName: "http_pin",
			primaryKey: "id",
			updates: [{ rowData: { id: 3 }, columnName: "name", value: "cc" }],
		},
	},
	{
		name: "delete record",
		method: "DELETE",
		path: `/api/pg/records?db=${DB}`,
		body: { tableName: "http_pin", primaryKeys: [{ columnName: "id", value: 3 }] },
	},
	{ name: "unknown db type", path: `/api/nope/tables?db=${DB}` },
	{ name: "missing db query param", path: "/api/pg/tables" },
	{ name: "bad limit", path: `/api/pg/tables/http_pin/data?db=${DB}&limit=abc` },
	{
		name: "query body missing",
		method: "POST",
		path: `/api/pg/query?db=${DB}`,
		headers: { "content-type": "application/json" },
		rawBody: "{}",
	},
	{
		name: "query body malformed json",
		method: "POST",
		path: `/api/pg/query?db=${DB}`,
		headers: { "content-type": "application/json" },
		rawBody: "{not json",
	},
	{ name: "keys on sql engine", path: `/api/pg/keys?db=${DB}` },
	{ name: "chat body invalid", method: "POST", path: "/api/chat", body: { nope: true } },
	{ name: "chat limit", path: "/api/chat/limit" },
	{
		name: "chat stream",
		method: "POST",
		path: "/api/chat",
		headers: { "x-byok-openai": "sk-test" },
		body: chatBody("hi"),
	},
	{
		name: "chat proxy rejection",
		method: "POST",
		path: "/api/chat",
		body: chatBody("reject"),
	},
	{ name: "telemetry config", path: "/api/telemetry/config", shapeOnly: true },
	{
		name: "telemetry preference invalid",
		method: "PUT",
		path: "/api/telemetry/preference",
		body: { enabled: "yes" },
	},
	{ name: "unknown api path", path: "/api/does/not/exist" },
	{ name: "unknown api path under db type", path: `/api/pg/nothing?db=${DB}` },
	{
		name: "request id rejected when unsafe",
		path: "/api/databases/current",
		headers: { "x-request-id": "bad id!" },
	},
	{
		name: "cors preflight disallowed origin",
		method: "OPTIONS",
		path: "/api/databases",
		headers: {
			origin: "http://evil.example",
			"access-control-request-method": "DELETE",
			"access-control-request-headers": "content-type",
		},
	},
	{
		name: "cors get disallowed origin",
		path: "/api/databases/current",
		headers: { origin: "http://evil.example" },
	},
	{
		name: "cors preflight allowed origin",
		method: "OPTIONS",
		path: `/api/pg/tables?db=${DB}`,
		headers: {
			origin: "https://allowed.example",
			"access-control-request-method": "PATCH",
			"access-control-request-headers": "content-type,x-request-id",
		},
	},
	{
		name: "cors get allowed origin",
		path: "/api/databases/current",
		headers: { origin: "https://allowed.example" },
	},
	{ name: "spa index", path: "/" },
	{ name: "spa deep link", path: "/table/users" },
	{ name: "spa asset", path: `/assets/${asset}` },
	{ name: "missing asset", path: "/assets/does-not-exist.js" },
	{ name: "favicon", path: "/favicon.ico" },
	{ name: "root static file", path: "/favicon.png" },
	{ name: "drop scratch table", method: "DELETE", path: `/api/pg/tables/http_pin?db=${DB}` },
];

const dropTimings = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(dropTimings);
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value).map(([k, v]) => [k, k === "duration" ? "<ms>" : dropTimings(v)]),
		);
	return value;
};

const normalizeRequestId = (value: string | null, sent: string | undefined) => {
	if (value === null) return null;
	if (value === sent) return "<echoed>";
	return UUID.test(value) ? "<generated uuid>" : value;
};

const results = [];
for (const probe of probes) {
	const sentId = probe.headers?.["x-request-id"] ?? REQUEST_ID;
	const headers: Record<string, string> = { "x-request-id": REQUEST_ID, ...probe.headers };
	if (probe.body !== undefined) headers["content-type"] = "application/json";
	const res = await fetch(`${baseUrl}${probe.path}`, {
		method: probe.method ?? "GET",
		headers,
		body: probe.rawBody ?? (probe.body === undefined ? undefined : JSON.stringify(probe.body)),
		redirect: "manual",
	});
	const startedAt = performance.now();
	let firstChunkAt = 0;
	let text = "";
	const decoder = new TextDecoder();
	for await (const chunk of res.body ?? []) {
		firstChunkAt ||= performance.now();
		text += decoder.decode(chunk, { stream: true });
	}
	const streamed =
		firstChunkAt - startedAt < STREAM_GAP_MS &&
		performance.now() - firstChunkAt >= STREAM_GAP_MS - 50;
	let body: unknown;
	try {
		const json = JSON.parse(text);
		body = probe.shapeOnly ? shape(json) : dropTimings(json);
		if (body && typeof body === "object" && "requestId" in body) {
			const { requestId } = body as { requestId: string };
			(body as { requestId: string }).requestId = normalizeRequestId(requestId, sentId) ?? "";
		}
	} catch {
		body = text.startsWith("<!")
			? `<html ${text.length > 0 ? "non-empty" : "empty"}>`
			: text.slice(0, 400);
	}
	results.push({
		name: probe.name,
		status: res.status,
		requestId: normalizeRequestId(res.headers.get("x-request-id"), sentId),
		headers: Object.fromEntries(
			RECORDED_HEADERS.flatMap((h) => {
				const v = res.headers.get(h);
				return v === null
					? []
					: [[h, h === "content-disposition" || h === "content-type" ? v : v.toLowerCase()]];
			}),
		),
		body,
		...(probe.name === "chat stream" ? { streamed } : {}),
	});
	console.log(`${res.status}  ${probe.name}`);
}

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "artifacts");
await mkdir(outDir, { recursive: true });
const out = path.join(outDir, `http-surface-${label}.json`);
await writeFile(out, `${JSON.stringify(results, null, 2)}\n`);
console.log(`wrote ${path.relative(process.cwd(), out)}`);
fakeProxy.close();
