import { HTTPException } from "@/http-exception.js";
import {
	formatFileSize,
	type SqliteClient,
	type SqlParam,
	type SqlResult,
	type SqlStatement,
} from "@/sqlite-client.js";

export interface D1Target {
	accountId: string;
	databaseId: string;
	token: string;
}

// The CLI redacts anything shaped like a connection URL from startup errors, so these
// messages describe the URL instead of quoting an example.
export const parseD1Url = (url: string): D1Target => {
	const { host, pathname, searchParams } = new URL(url);
	const databaseId = decodeURIComponent(pathname.slice(1));
	const token = searchParams.get("authToken") || process.env.CLOUDFLARE_API_TOKEN;
	if (!host)
		throw new Error("The Cloudflare D1 URL has no account id: put it where the host goes");
	if (!databaseId)
		throw new Error("The Cloudflare D1 URL has no database id: put it where the path goes");
	if (!token)
		throw new Error(
			"The Cloudflare D1 URL has no authToken parameter and CLOUDFLARE_API_TOKEN is not set",
		);
	return { accountId: host, databaseId, token };
};

interface D1Response<T> {
	success: boolean;
	errors?: { code: number; message: string }[];
	result: T | null;
}

/** D1 returns a blob as an array of byte values. */
type D1Cell = null | string | number | number[];

interface D1RawResult {
	results: { columns: string[]; rows: D1Cell[][] };
	meta: { changes: number };
}

interface D1Database {
	name: string;
	file_size: number;
}

const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

// JSON has no bigint; a decimal string keeps the exact value and an INTEGER column's
// affinity turns it back into an integer.
const toD1Param = (value: SqlParam) =>
	typeof value !== "bigint"
		? value
		: value >= MIN_SAFE && value <= MAX_SAFE
			? Number(value)
			: value.toString();

const toD1Statement = (stmt: SqlStatement | string) =>
	typeof stmt === "string"
		? { sql: stmt, params: [] }
		: { sql: stmt.sql, params: stmt.args.map(toD1Param) };

const toResult = ({ results, meta }: D1RawResult): SqlResult => ({
	columns: results.columns,
	rows: results.rows.map((row) =>
		row.map((cell) => (Array.isArray(cell) ? Uint8Array.from(cell).buffer : cell)),
	),
	rowsAffected: meta.changes,
});

export const createD1Client = ({ accountId, databaseId, token }: D1Target): SqliteClient => {
	const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}`;

	const request = async <T>(path: string, body?: unknown): Promise<T> => {
		const res = await fetch(`${base}${path}`, {
			method: body === undefined ? "GET" : "POST",
			headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		const text = await res.text();
		let parsed: D1Response<T> | undefined;
		try {
			parsed = JSON.parse(text) as D1Response<T>;
		} catch {
			parsed = undefined;
		}
		const message = parsed?.errors?.[0]?.message;
		// BaseAdapter.wrapError maps "HTTP status 401/403" to 503, as for a bad libSQL token.
		if (res.status === 401 || res.status === 403)
			throw new Error(
				`${message ?? "Cloudflare D1 refused the API token"} (HTTP status ${res.status})`,
			);
		if (!parsed?.success || parsed.result === null)
			throw new Error(
				message ?? `Cloudflare D1 request failed with HTTP status ${res.status}`,
			);
		return parsed.result;
	};

	const batch = async (stmts: (SqlStatement | string)[]) => {
		if (!stmts.length) return [];
		const results = await request<D1RawResult[]>("/raw", { batch: stmts.map(toD1Statement) });
		return results.map(toResult);
	};

	return {
		execute: async (stmt) =>
			toResult((await request<D1RawResult[]>("/raw", toD1Statement(stmt)))[0]),
		// D1 runs every batch as one transaction; there is no read-only mode to ask for.
		batch,
		rebuildTable: async (statements, referencedBy) => {
			if (referencedBy.length) {
				const tables = referencedBy.map((t) => `"${t}"`).join(", ");
				const verb = referencedBy.length === 1 ? "references" : "reference";
				throw new HTTPException(400, {
					message: `Cloudflare D1 always enforces foreign keys, so changing a column of a table that ${tables} ${verb} would delete or block their rows`,
				});
			}
			await batch(statements);
		},
		info: async () => {
			const { name, file_size } = await request<D1Database>("");
			return { name, size: formatFileSize(file_size), version: "Cloudflare D1" };
		},
		close: () => {},
	};
};
