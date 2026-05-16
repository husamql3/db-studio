import type { ExecuteQueryResult } from "@db-studio/shared/types";

type ShapeFn = (reply: unknown) => Pick<ExecuteQueryResult, "columns" | "rows" | "rowCount">;

const isStringArray = (v: unknown): v is string[] =>
	Array.isArray(v) && v.every((x) => typeof x === "string" || x === null);

const isFlatPairArray = (v: unknown): v is unknown[] => Array.isArray(v) && v.length % 2 === 0;

/**
 * Tokenize a redis-cli style command line into an argv array.
 * Supports single and double quotes; backslash-escapes inside double quotes.
 *
 * Examples:
 *   "GET foo"                         -> ["GET", "foo"]
 *   'SET foo "hello world"'           -> ["SET", "foo", "hello world"]
 *   "HSET k field 'value with space'" -> ["HSET", "k", "field", "value with space"]
 */
export function tokenizeCommand(input: string): string[] {
	const out: string[] = [];
	let cur = "";
	let i = 0;
	let inSingle = false;
	let inDouble = false;

	while (i < input.length) {
		const ch = input[i];

		if (inSingle) {
			if (ch === "'") inSingle = false;
			else cur += ch;
			i++;
			continue;
		}

		if (inDouble) {
			if (ch === "\\" && i + 1 < input.length) {
				cur += input[i + 1];
				i += 2;
				continue;
			}
			if (ch === '"') inDouble = false;
			else cur += ch;
			i++;
			continue;
		}

		if (ch === "'") {
			inSingle = true;
			i++;
			continue;
		}
		if (ch === '"') {
			inDouble = true;
			i++;
			continue;
		}
		if (ch === " " || ch === "\t" || ch === "\n") {
			if (cur.length > 0) {
				out.push(cur);
				cur = "";
			}
			i++;
			continue;
		}

		cur += ch;
		i++;
	}

	if (inSingle || inDouble) {
		throw new Error("Unterminated quoted string in command");
	}
	if (cur.length > 0) out.push(cur);
	return out;
}

const singleCellFallback: ShapeFn = (reply) => ({
	columns: ["result"],
	rows: [{ result: typeof reply === "string" ? reply : JSON.stringify(reply, null, 2) }],
	rowCount: 1,
});

const scalarShape: ShapeFn = (reply) => {
	if (reply === null) {
		return {
			columns: ["value"],
			rows: [{ value: null }],
			rowCount: 0,
		};
	}
	return {
		columns: ["value"],
		rows: [{ value: reply as string | number }],
		rowCount: 1,
	};
};

const statusShape: ShapeFn = (reply) => ({
	columns: ["status"],
	rows: [{ status: reply as string }],
	rowCount: 1,
});

const flatArrayShape: ShapeFn = (reply) => {
	if (!Array.isArray(reply)) return singleCellFallback(reply);
	return {
		columns: ["#", "value"],
		rows: reply.map((v, idx) => ({ "#": idx, value: v as unknown })),
		rowCount: reply.length,
	};
};

const pairArrayShape: ShapeFn = (reply) => {
	if (!isFlatPairArray(reply)) return singleCellFallback(reply);
	const rows: Record<string, unknown>[] = [];
	for (let i = 0; i < reply.length; i += 2) {
		rows.push({ field: reply[i], value: reply[i + 1] });
	}
	return { columns: ["field", "value"], rows, rowCount: rows.length };
};

const zrangeWithScoresShape: ShapeFn = (reply) => {
	if (!isFlatPairArray(reply)) return flatArrayShape(reply);
	const rows: Record<string, unknown>[] = [];
	for (let i = 0; i < reply.length; i += 2) {
		rows.push({ member: reply[i], score: reply[i + 1] });
	}
	return { columns: ["member", "score"], rows, rowCount: rows.length };
};

const infoShape: ShapeFn = (reply) => {
	if (typeof reply !== "string") return singleCellFallback(reply);
	const rows: Record<string, unknown>[] = [];
	let section = "";
	for (const line of reply.split(/\r?\n/)) {
		if (!line.trim()) continue;
		if (line.startsWith("#")) {
			section = line.replace(/^#\s*/, "").trim();
			continue;
		}
		const idx = line.indexOf(":");
		if (idx < 0) continue;
		rows.push({ section, key: line.slice(0, idx), value: line.slice(idx + 1) });
	}
	return { columns: ["section", "key", "value"], rows, rowCount: rows.length };
};

const xrangeShape: ShapeFn = (reply) => {
	if (!Array.isArray(reply)) return singleCellFallback(reply);
	const rows = reply.map((entry) => {
		if (!Array.isArray(entry) || entry.length < 2) return { id: null, fields: null };
		const [id, fields] = entry;
		const fieldsObj: Record<string, unknown> = {};
		if (Array.isArray(fields)) {
			for (let i = 0; i < fields.length; i += 2) {
				fieldsObj[String(fields[i])] = fields[i + 1];
			}
		}
		return { id, fields: fieldsObj };
	});
	return { columns: ["id", "fields"], rows, rowCount: rows.length };
};

/**
 * Dispatch table keyed on the canonical (uppercase) command name.
 * If a command isn't found here, the reply is wrapped as a single-cell JSON row.
 */
const COMMAND_SHAPES: Record<string, ShapeFn> = {
	PING: statusShape,
	GET: scalarShape,
	SET: statusShape,
	TYPE: scalarShape,
	TTL: scalarShape,
	EXISTS: scalarShape,
	DBSIZE: scalarShape,
	DEL: scalarShape,
	INCR: scalarShape,
	DECR: scalarShape,
	STRLEN: scalarShape,
	LLEN: scalarShape,
	SCARD: scalarShape,
	ZCARD: scalarShape,
	HLEN: scalarShape,

	HGET: scalarShape,
	HMGET: flatArrayShape,
	MGET: flatArrayShape,
	KEYS: flatArrayShape,
	LRANGE: flatArrayShape,
	SMEMBERS: flatArrayShape,

	HGETALL: pairArrayShape,
	HKEYS: flatArrayShape,
	HVALS: flatArrayShape,
	"CONFIG GET": pairArrayShape,

	ZRANGE: flatArrayShape, // becomes pair-shaped only with WITHSCORES; caller can post-process
	INFO: infoShape,
	XRANGE: xrangeShape,
	XREVRANGE: xrangeShape,
};

/**
 * Shape a Redis reply into ExecuteQueryResult-compatible columns/rows/rowCount.
 * Pass `argv` (already tokenized) so we can detect modifiers like `WITHSCORES`.
 */
export function shapeReply(
	argv: string[],
	reply: unknown,
): Pick<ExecuteQueryResult, "columns" | "rows" | "rowCount"> {
	if (argv.length === 0) return singleCellFallback(reply);

	const cmd = argv[0]?.toUpperCase() ?? "";
	const subcmd = argv[1]?.toUpperCase();

	// Special case: ZRANGE … WITHSCORES → pair shape with {member, score}
	if (
		(cmd === "ZRANGE" || cmd === "ZREVRANGE" || cmd === "ZRANGEBYSCORE") &&
		argv.some((a) => a.toUpperCase() === "WITHSCORES")
	) {
		return zrangeWithScoresShape(reply);
	}

	// Two-word commands like CONFIG GET
	if (subcmd) {
		const compound = `${cmd} ${subcmd}`;
		const shaper = COMMAND_SHAPES[compound];
		if (shaper) return shaper(reply);
	}

	const shaper = COMMAND_SHAPES[cmd];
	if (shaper) return shaper(reply);

	// Heuristic for unknown commands
	if (typeof reply === "string" || typeof reply === "number" || reply === null) {
		return scalarShape(reply);
	}
	if (isStringArray(reply)) return flatArrayShape(reply);

	return singleCellFallback(reply);
}
