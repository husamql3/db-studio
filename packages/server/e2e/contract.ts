import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULTS } from "@db-studio/shared/constants";
import {
	type ColumnInfoSchemaType,
	columnInfoSchema,
	connectionInfoSchema,
	currentDatabaseSchema,
	DATABASE_ENGINES,
	type DatabaseTypeSchema,
	databaseListSchema,
	indexInfoSchema,
	type TableDataResultSchemaType,
	tableDataResultSchema,
	tableInfoSchema,
} from "@db-studio/shared/types";
import { z } from "zod";

process.env.TZ = "UTC";
process.env.DB_STUDIO_TELEMETRY = "0";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Method = "GET" | "POST" | "PATCH" | "DELETE";
type Ctx = { db: string; bodies: Map<string, unknown> };

type Step = {
	name: string;
	method: Method;
	path: string;
	/** Overrides `path` when it depends on an earlier response. */
	resolvePath?: (ctx: Ctx) => string;
	query?: (ctx: Ctx) => Record<string, string>;
	body?: (ctx: Ctx) => unknown;
	/** Accepted statuses; any 2xx when omitted. */
	expect?: number | number[];
	/** Throws with a human-readable message when the response breaks the contract. */
	check?: (body: unknown, ctx: Ctx) => void;
	/** Projection written to the artifact instead of the full body. */
	record?: (body: unknown) => unknown;
};

type EngineOverrides = {
	selectOne?: string;
	dbName?: (url: URL) => string;
};

const OVERRIDES: Partial<Record<DatabaseTypeSchema, EngineOverrides>> = {
	sqlite: { dbName: () => "main" },
	duckdb: { dbName: (url) => path.parse(url.pathname).name },
	oracle: { selectOne: 'SELECT 1 AS "one" FROM dual' },
};

const TABLE = "dbstudio_e2e";
const RENAMED = "dbstudio_e2e_renamed";
const PAIRS = "dbstudio_e2e_pairs";
const PAIR_ROWS = [
	{ tenant: 1, item: 1, name: "x1" },
	{ tenant: 1, item: 2, name: "x2" },
	{ tenant: 2, item: 1, name: "x3" },
];
const ROW_COUNT = 25;
const PAGE = 10;
const COLUMNS = ["id", "name", "active", "amount", "born", "meta"];
const INDEX = "dbstudio_e2e_born_name_idx";
// Deliberately neither alphabetical nor table order, so a listing that loses key order fails.
const INDEX_COLUMNS = ["born", "name"];

const pad = (n: number) => String(n).padStart(2, "0");
const rowName = (n: number) => `row-${pad(n)}`;

const seedRows = Array.from({ length: ROW_COUNT }, (_, i) => {
	const n = i + 1;
	return {
		name: rowName(n),
		active: n % 2 === 0,
		amount: n * 1.5,
		born: `1990-01-${pad(n)}`,
		meta: JSON.stringify({ rank: n }),
	};
});

const dataOf = <T extends z.ZodType>(schema: T, body: unknown): z.infer<T> =>
	schema.parse(z.object({ data: z.unknown() }).parse(body).data);

const pageOf = (body: unknown): TableDataResultSchemaType =>
	dataOf(tableDataResultSchema, body);
const columnsOf = (body: unknown): ColumnInfoSchemaType[] =>
	dataOf(z.array(columnInfoSchema), body);
const tablesOf = (body: unknown) => dataOf(z.array(tableInfoSchema), body);
const indexesOf = (body: unknown) => dataOf(z.array(indexInfoSchema), body);

const namesOf = (page: TableDataResultSchemaType) => page.data.map((row) => String(row.name));
const range = (from: number, to: number) =>
	Array.from({ length: to - from + 1 }, (_, i) => rowName(from + i));

const assert: (condition: unknown, message: string) => asserts condition = (
	condition,
	message,
) => {
	if (!condition) throw new Error(message);
};

const assertEqual = (actual: unknown, expected: unknown, label: string) => {
	const a = JSON.stringify(actual);
	const e = JSON.stringify(expected);
	assert(a === e, `${label}: expected ${e}, got ${a}`);
};

const prior = (ctx: Ctx, step: string) => {
	assert(ctx.bodies.has(step), `depends on step "${step}", which produced no body`);
	return ctx.bodies.get(step);
};

const cursorFrom = (ctx: Ctx, step: string, key: "nextCursor" | "prevCursor") => {
	const cursor = pageOf(prior(ctx, step)).meta[key];
	assert(cursor, `step "${step}" returned no ${key}`);
	return cursor;
};

const row07 = (ctx: Ctx) => {
	const [row] = pageOf(prior(ctx, "filter name = row-07")).data;
	assert(row, 'step "filter name = row-07" returned no row');
	return row;
};

const filterBy = (column: string, value: string) =>
	JSON.stringify([{ columnName: column, operator: "=", value }]);

const onlyE2eTables = (body: unknown) =>
	tablesOf(body).filter((t) => t.tableName.startsWith(TABLE));

const buildScenario = (dbType: DatabaseTypeSchema, overrides: EngineOverrides): Step[] => {
	const t = `/${dbType}/tables`;
	const records = `/${dbType}/records`;
	const dataOfTable = `${t}/${TABLE}/data`;
	const canMutateRows = DATABASE_ENGINES[dbType].rowMutation;
	const indexes = DATABASE_ENGINES[dbType].indexes;
	const indexesPath = `${t}/${TABLE}/indexes`;

	const indexSteps: Step[] = indexes
		? [
				{
					name: "indexes: create two-column index",
					method: "POST",
					path: indexesPath,
					body: () => ({ indexName: INDEX, columns: INDEX_COLUMNS, isUnique: false }),
				},
				{
					name: "indexes: list has the new index and the primary key",
					method: "GET",
					path: indexesPath,
					check: (body) => {
						const list = indexesOf(body);
						const created = list.find((i) => i.indexName === INDEX);
						assert(created, `${INDEX} missing from indexes list`);
						assertEqual(created.columns, INDEX_COLUMNS, "index columns");
						assertEqual(created.isUnique, false, "isUnique");
						assertEqual(created.kind, "index", "kind");
						assertEqual(created.definition, null, "definition");
						if (indexes.methods.length)
							assertEqual(created.method, indexes.methods[0], "default method");
						const primary = list.filter((i) => i.kind === "primary");
						assertEqual(
							primary.map((i) => ({ columns: i.columns, isUnique: i.isUnique })),
							[{ columns: ["id"], isUnique: true }],
							"primary key index",
						);
						assertEqual(list[0]?.kind, "primary", "first listed index");
					},
					record: indexesOf,
				},
				{
					name: "indexes: duplicate name is refused",
					method: "POST",
					path: indexesPath,
					body: () => ({ indexName: INDEX, columns: ["name"], isUnique: false }),
					expect: 409,
				},
				{
					name: "indexes: unknown column is refused",
					method: "POST",
					path: indexesPath,
					body: () => ({
						indexName: `${TABLE}_missing_idx`,
						columns: ["name", "no_such_column"],
						isUnique: false,
					}),
					expect: 400,
				},
				{
					name: "indexes: dropping the primary key index is refused",
					method: "DELETE",
					path: indexesPath,
					resolvePath: (ctx) => {
						const primary = indexesOf(
							prior(ctx, "indexes: list has the new index and the primary key"),
						).find((i) => i.kind === "primary");
						assert(primary, "no primary key index to try dropping");
						return `${indexesPath}/${encodeURIComponent(primary.indexName)}`;
					},
					expect: 400,
				},
				{
					name: "indexes: drop index",
					method: "DELETE",
					path: `${indexesPath}/${INDEX}`,
				},
				{
					name: "indexes: list after drop keeps only the primary key",
					method: "GET",
					path: indexesPath,
					check: (body) => {
						assertEqual(
							indexesOf(body).map((i) => i.kind),
							["primary"],
							"index kinds after drop",
						);
					},
					record: indexesOf,
				},
				{
					name: "indexes: dropping a missing index is 404",
					method: "DELETE",
					path: `${indexesPath}/${INDEX}`,
					expect: 404,
				},
			]
		: [];

	return [
		{
			name: "cleanup: delete leftover table",
			method: "DELETE",
			path: `${t}/${TABLE}`,
			expect: [200, 404],
		},
		{
			name: "cleanup: delete leftover renamed table",
			method: "DELETE",
			path: `${t}/${RENAMED}`,
			expect: [200, 404],
		},
		{
			name: "cleanup: delete leftover composite key table",
			method: "DELETE",
			path: `${t}/${PAIRS}`,
			expect: [200, 404],
		},
		{
			name: "list databases",
			method: "GET",
			path: "/databases",
			check: (body, ctx) => {
				const list = dataOf(databaseListSchema, body);
				assertEqual(list.dbType, dbType, "dbType");
				assert(
					list.databases.some((d) => d.name === ctx.db),
					`connected database "${ctx.db}" missing from list`,
				);
			},
		},
		{
			name: "current database",
			method: "GET",
			path: "/databases/current",
			check: (body, ctx) => {
				const current = dataOf(currentDatabaseSchema.partial(), body);
				assertEqual(current.dbType, dbType, "dbType");
				assertEqual(current.db, ctx.db, "current db");
			},
		},
		{
			name: "connection info",
			method: "GET",
			path: "/databases/connection",
			check: (body, ctx) => {
				assertEqual(dataOf(connectionInfoSchema, body).database, ctx.db, "database");
			},
		},
		{
			name: "create table",
			method: "POST",
			path: t,
			body: () => ({
				tableName: TABLE,
				fields: [
					{ columnName: "id", columnType: "int4", isPrimaryKey: true, isIdentity: true },
					{ columnName: "name", columnType: "text" },
					{ columnName: "active", columnType: "boolean" },
					{ columnName: "amount", columnType: "float8" },
					{ columnName: "born", columnType: "date" },
					{ columnName: "meta", columnType: "json", isNullable: true },
				],
			}),
		},
		{
			name: "list tables after create",
			method: "GET",
			path: t,
			check: (body) => {
				const table = tablesOf(body).find((x) => x.tableName === TABLE);
				assert(table, `${TABLE} missing from tables list`);
				assertEqual(table.rowCount, 0, "rowCount");
			},
			record: onlyE2eTables,
		},
		{
			name: "get columns",
			method: "GET",
			path: `${t}/${TABLE}/columns`,
			check: (body) => {
				const cols = columnsOf(body);
				assertEqual(
					cols.map((c) => c.columnName),
					COLUMNS,
					"column names",
				);
				const types = Object.fromEntries(cols.map((c) => [c.columnName, c.dataType]));
				assertEqual(
					types,
					{
						id: "number",
						name: "text",
						active: "boolean",
						amount: "number",
						born: "date",
						meta: "json",
					},
					"column dataTypes",
				);
				assertEqual(
					cols.filter((c) => c.isPrimaryKey).map((c) => c.columnName),
					["id"],
					"primary key",
				);
			},
		},
		{
			name: "bulk insert 25 rows",
			method: "POST",
			path: `${records}/bulk`,
			body: () => ({ tableName: TABLE, records: seedRows }),
			check: (body) => {
				const result = dataOf(
					z.object({ successCount: z.number(), failureCount: z.number() }),
					body,
				);
				assertEqual(result, { successCount: ROW_COUNT, failureCount: 0 }, "bulk result");
			},
		},
		{
			name: "add one record",
			method: "POST",
			path: records,
			body: () => ({
				tableName: TABLE,
				data: {
					name: rowName(26),
					active: "true",
					amount: "39",
					born: "1990-01-26",
					meta: JSON.stringify({ rank: 26 }),
				},
			}),
		},
		{
			name: "page 1 (limit 10, id asc)",
			method: "GET",
			path: dataOfTable,
			query: () => ({ limit: String(PAGE), sort: "id", order: "asc" }),
			check: (body) => {
				const page = pageOf(body);
				assertEqual(namesOf(page), range(1, 10), "page 1 rows");
				assertEqual(page.meta.total, 26, "total");
				assert(page.meta.hasNextPage, "hasNextPage should be true");
				assert(!page.meta.hasPreviousPage, "hasPreviousPage should be false");
			},
		},
		{
			name: "page 2 via next cursor",
			method: "GET",
			path: dataOfTable,
			query: (ctx) => ({
				limit: String(PAGE),
				sort: "id",
				order: "asc",
				direction: "asc",
				cursor: cursorFrom(ctx, "page 1 (limit 10, id asc)", "nextCursor"),
			}),
			check: (body, ctx) => {
				const page = pageOf(body);
				const first = namesOf(pageOf(prior(ctx, "page 1 (limit 10, id asc)")));
				assertEqual(namesOf(page), range(11, 20), "page 2 rows");
				assert(
					namesOf(page).every((n) => !first.includes(n)),
					"page 2 overlaps page 1",
				);
				assert(page.meta.hasPreviousPage, "hasPreviousPage should be true");
			},
		},
		{
			name: "back to page 1 via prev cursor",
			method: "GET",
			path: dataOfTable,
			query: (ctx) => ({
				limit: String(PAGE),
				sort: "id",
				order: "asc",
				direction: "desc",
				cursor: cursorFrom(ctx, "page 2 via next cursor", "prevCursor"),
			}),
			check: (body) => {
				assertEqual(namesOf(pageOf(body)), range(1, 10), "prev page rows");
			},
		},
		{
			name: "sort id desc",
			method: "GET",
			path: dataOfTable,
			query: () => ({ limit: String(PAGE), sort: "id", order: "desc" }),
			check: (body) => {
				assertEqual(namesOf(pageOf(body)), range(17, 26).reverse(), "desc rows");
			},
		},
		{
			name: "filter name = row-07",
			method: "GET",
			path: dataOfTable,
			query: () => ({ limit: String(PAGE), filters: filterBy("name", rowName(7)) }),
			check: (body) => {
				const page = pageOf(body);
				assertEqual(namesOf(page), [rowName(7)], "filtered rows");
				assertEqual(page.meta.total, 1, "filtered total");
			},
		},
		{
			name: canMutateRows ? "update row-07 amount" : "grid update is refused",
			method: "PATCH",
			path: records,
			body: (ctx) => ({
				tableName: TABLE,
				primaryKey: "id",
				updates: [{ rowData: row07(ctx), columnName: "amount", value: 999 }],
			}),
			...(canMutateRows ? {} : { expect: 400 }),
		},
		{
			name: canMutateRows ? "read back updated row-07" : "refused update kept row-07",
			method: "GET",
			path: dataOfTable,
			query: () => ({ limit: String(PAGE), filters: filterBy("name", rowName(7)) }),
			check: (body) => {
				const [row] = pageOf(body).data;
				assert(row, "row-07 missing after update");
				assertEqual(Number(row.amount), canMutateRows ? 999 : 10.5, "row amount");
			},
		},
		{
			name: canMutateRows ? "delete row-07" : "grid delete is refused",
			method: "DELETE",
			path: records,
			body: (ctx) => ({
				tableName: TABLE,
				primaryKeys: [{ columnName: "id", value: row07(ctx).id }],
			}),
			...(canMutateRows
				? {
						check: (body: unknown) => {
							assertEqual(
								dataOf(z.object({ deletedCount: z.number() }), body).deletedCount,
								1,
								"deletedCount",
							);
						},
					}
				: { expect: 400 }),
		},
		{
			name: canMutateRows ? "deleted row-07 is gone" : "refused delete kept row-07",
			method: "GET",
			path: dataOfTable,
			query: () => ({ limit: String(PAGE), filters: filterBy("name", rowName(7)) }),
			check: (body) => {
				assertEqual(
					namesOf(pageOf(body)),
					canMutateRows ? [] : [rowName(7)],
					"rows matching row-07",
				);
			},
		},
		{
			name: "row count after delete",
			method: "GET",
			path: t,
			check: (body) => {
				const table = tablesOf(body).find((x) => x.tableName === TABLE);
				assertEqual(table?.rowCount, canMutateRows ? ROW_COUNT : ROW_COUNT + 1, "rowCount");
			},
			record: onlyE2eTables,
		},
		{
			name: "add column note",
			method: "POST",
			path: `${t}/${TABLE}/columns`,
			body: () => ({ columnName: "note", columnType: "varchar", isNullable: true }),
		},
		{
			name: "rename column note -> remark",
			method: "PATCH",
			path: `${t}/${TABLE}/columns/note/rename`,
			body: () => ({ newColumnName: "remark" }),
		},
		{
			name: "alter column remark to text",
			method: "PATCH",
			path: `${t}/${TABLE}/columns/remark`,
			body: () => ({ columnType: "text", isNullable: true }),
		},
		{
			name: "columns after add/rename/alter",
			method: "GET",
			path: `${t}/${TABLE}/columns`,
			check: (body) => {
				const cols = columnsOf(body);
				assertEqual(
					cols.map((c) => c.columnName),
					[...COLUMNS, "remark"],
					"column names",
				);
				const remark = cols.find((c) => c.columnName === "remark");
				assertEqual(remark?.dataType, "text", "remark type");
				assertEqual(remark?.isNullable, true, "remark nullable");
			},
		},
		{
			name: "delete column remark",
			method: "DELETE",
			path: `${t}/${TABLE}/columns/remark`,
		},
		{
			name: "columns after delete",
			method: "GET",
			path: `${t}/${TABLE}/columns`,
			check: (body) => {
				assertEqual(
					columnsOf(body).map((c) => c.columnName),
					COLUMNS,
					"column names",
				);
			},
		},
		...indexSteps,
		{
			name: "execute raw query",
			method: "POST",
			path: `/${dbType}/query`,
			body: () => ({ query: overrides.selectOne ?? "SELECT 1 AS one" }),
			check: (body) => {
				const result = dataOf(
					z.object({
						columns: z.array(z.string()),
						rows: z.array(z.record(z.string(), z.unknown())),
					}),
					body,
				);
				assertEqual(
					result.columns.map((c) => c.toLowerCase()),
					["one"],
					"columns",
				);
				assertEqual(result.rows.length, 1, "row count");
				assertEqual(Number(Object.values(result.rows[0] ?? {})[0]), 1, "value");
			},
		},
		{
			name: "export json",
			method: "GET",
			path: `${t}/${TABLE}/export`,
			query: () => ({ format: "json" }),
			check: (body) => {
				const rows = z.array(z.record(z.string(), z.unknown())).parse(body);
				assertEqual(
					rows.map((r) => String(r.name)).sort(),
					canMutateRows ? range(1, 26).filter((n) => n !== rowName(7)) : range(1, 26),
					"exported names",
				);
			},
			record: (body) =>
				z
					.array(z.record(z.string(), z.unknown()))
					.parse(body)
					.sort((a, b) => String(a.name).localeCompare(String(b.name))),
		},
		{
			name: "export csv",
			method: "GET",
			path: `${t}/${TABLE}/export`,
			query: () => ({ format: "csv" }),
			check: (body) => {
				const lines = String(body).trim().split("\n");
				assertEqual(lines[0], COLUMNS.join(","), "csv header");
				assertEqual(
					lines.length - 1,
					canMutateRows ? ROW_COUNT : ROW_COUNT + 1,
					"csv data lines",
				);
			},
			record: (body) => {
				const [header, ...rows] = String(body).trim().split("\n");
				return { header, dataLines: rows.length };
			},
		},
		{
			name: "rename table",
			method: "PATCH",
			path: `${t}/${TABLE}/rename`,
			body: () => ({ newTableName: RENAMED }),
		},
		{
			name: "list tables after rename",
			method: "GET",
			path: t,
			check: (body) => {
				const names = tablesOf(body).map((x) => x.tableName);
				assert(names.includes(RENAMED), `${RENAMED} missing after rename`);
				assert(!names.includes(TABLE), `${TABLE} still listed after rename`);
			},
			record: onlyE2eTables,
		},
		{
			name: "delete table",
			method: "DELETE",
			path: `${t}/${RENAMED}`,
			check: (body) => {
				assertEqual(
					dataOf(z.object({ deletedCount: z.number() }), body).deletedCount,
					canMutateRows ? ROW_COUNT : ROW_COUNT + 1,
					"deletedCount",
				);
			},
		},
		{
			name: "composite key: create table",
			method: "POST",
			path: t,
			body: () => ({
				tableName: PAIRS,
				fields: [
					{ columnName: "tenant", columnType: "int4", isPrimaryKey: true },
					{ columnName: "item", columnType: "int4", isPrimaryKey: true },
					{ columnName: "name", columnType: "text" },
				],
			}),
		},
		{
			name: "composite key: insert rows sharing a tenant",
			method: "POST",
			path: `${records}/bulk`,
			body: () => ({ tableName: PAIRS, records: PAIR_ROWS }),
		},
		{
			name: "composite key: update by a partial key is refused",
			method: "PATCH",
			path: records,
			body: () => ({
				tableName: PAIRS,
				primaryKey: "tenant",
				updates: [{ rowData: PAIR_ROWS[1], columnName: "name", value: "every-tenant-row" }],
			}),
			expect: 400,
		},
		{
			name: canMutateRows
				? "composite key: update one row by both keys"
				: "composite key: grid update is refused",
			method: "PATCH",
			path: records,
			body: () => ({
				tableName: PAIRS,
				primaryKeys: ["tenant", "item"],
				updates: [{ rowData: PAIR_ROWS[1], columnName: "name", value: "x2-edited" }],
			}),
			...(canMutateRows ? {} : { expect: 400 }),
		},
		{
			name: "composite key: only the addressed row changed",
			method: "GET",
			path: `${t}/${PAIRS}/data`,
			query: () => ({ limit: String(PAGE), sort: "name", order: "asc" }),
			check: (body) => {
				assertEqual(
					namesOf(pageOf(body)),
					canMutateRows ? ["x1", "x2-edited", "x3"] : ["x1", "x2", "x3"],
					"names after update",
				);
			},
		},
		{
			name: "composite key: delete is refused",
			method: "DELETE",
			path: records,
			body: () => ({ tableName: PAIRS, primaryKeys: [{ columnName: "tenant", value: 1 }] }),
			expect: 400,
		},
		{
			name: "composite key: force delete is refused",
			method: "DELETE",
			path: `${records}/force`,
			body: () => ({ tableName: PAIRS, primaryKeys: [{ columnName: "tenant", value: 1 }] }),
			expect: 400,
		},
		{
			name: "composite key: refused deletes kept every row",
			method: "GET",
			path: `${t}/${PAIRS}/data`,
			query: () => ({ limit: String(PAGE), sort: "name", order: "asc" }),
			check: (body) => {
				assertEqual(
					namesOf(pageOf(body)),
					canMutateRows ? ["x1", "x2-edited", "x3"] : ["x1", "x2", "x3"],
					"names after delete",
				);
			},
		},
		{
			name: "composite key: delete table",
			method: "DELETE",
			path: `${t}/${PAIRS}`,
		},
		{
			name: "list tables after delete",
			method: "GET",
			path: t,
			check: (body) => {
				assertEqual(onlyE2eTables(body), [], "e2e tables left");
			},
			record: onlyE2eTables,
		},
	];
};

const REDACTED_KEYS = new Set([
	"id",
	"version",
	"host",
	"port",
	"user",
	"owner",
	"size",
	"duration",
	"active_connections",
	"max_connections",
	"nextCursor",
	"prevCursor",
	"requestId",
]);

const normalize = (value: unknown, secrets: string[], key?: string): Json => {
	if (value === null || value === undefined) return null;
	if (key && REDACTED_KEYS.has(key)) return `<${key}>`;
	if (Array.isArray(value)) return value.map((v) => normalize(v, secrets));
	if (value instanceof Date) return value.toISOString();
	if (typeof value === "object") {
		return Object.fromEntries(
			Object.keys(value)
				.sort()
				.map((k) => [k, normalize((value as Record<string, unknown>)[k], secrets, k)]),
		);
	}
	if (typeof value === "string") {
		return secrets.reduce((s, secret) => s.replaceAll(secret, "<redacted>"), value);
	}
	if (typeof value === "number" || typeof value === "boolean") return value;
	return String(value);
};

const main = async () => {
	const label = process.argv[2];
	const databaseUrl = process.env.DATABASE_URL;
	if (!label || !databaseUrl) {
		console.error("usage: DATABASE_URL=<url> bun run e2e -- <label>");
		process.exit(2);
	}

	const { getDbType } = await import("../src/db-manager.js");
	const dbType = getDbType();
	if (dbType === "mongodb" || dbType === "redis") {
		console.error(`${dbType} is out of scope: this contract covers SQL engines only.`);
		process.exit(2);
	}

	const overrides = OVERRIDES[dbType] ?? {};
	const url = new URL(databaseUrl);
	const ctx: Ctx = {
		db: overrides.dbName?.(url) ?? decodeURIComponent(url.pathname.slice(1)),
		bodies: new Map(),
	};
	const secrets = [databaseUrl, databaseUrl.replace(/^[a-z0-9+]+:\/\//i, "")];

	const { createServer } = await import("../src/utils/create-server.js");
	const { app } = createServer();

	const results = [];
	let failures = 0;

	for (const step of buildScenario(dbType, overrides)) {
		let status = 0;
		let body: unknown = null;
		let error: string | undefined;
		try {
			const query = new URLSearchParams({ db: ctx.db, ...step.query?.(ctx) });
			const payload = step.body?.(ctx);
			const res = await app.request(
				`${DEFAULTS.API_PREFIX}${step.resolvePath?.(ctx) ?? step.path}?${query}`,
				{
					method: step.method,
					headers: payload === undefined ? {} : { "Content-Type": "application/json" },
					body: payload === undefined ? undefined : JSON.stringify(payload),
				},
			);
			status = res.status;
			const text = await res.text();
			try {
				body = JSON.parse(text);
			} catch {
				body = text;
			}
			const accepted = [step.expect ?? []].flat();
			const statusOk = accepted.length ? accepted.includes(status) : status < 300;
			assert(statusOk, `unexpected status ${status}: ${text.slice(0, 300)}`);
			if (status < 300) ctx.bodies.set(step.name, body);
			step.check?.(body, ctx);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}

		const ok = error === undefined;
		if (!ok) failures++;
		console.log(`${ok ? "PASS" : "FAIL"}  ${step.name}${ok ? "" : `  -- ${error}`}`);

		let recorded: unknown = body;
		if (step.record && ok) recorded = step.record(body);
		results.push({
			name: step.name,
			status,
			ok,
			body: normalize(recorded, secrets),
			...(ok ? {} : { error: normalize(error, secrets) }),
		});
	}

	const artifactDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "artifacts");
	await mkdir(artifactDir, { recursive: true });
	const artifactPath = path.join(artifactDir, `${label}.json`);
	await writeFile(
		artifactPath,
		`${JSON.stringify(normalize({ engine: dbType, steps: results }, secrets), null, 2)}\n`,
	);

	console.log(
		`${failures ? "FAIL" : "PASS"}  ${results.length - failures}/${results.length} steps -> ${path.relative(process.cwd(), artifactPath)}`,
	);
	process.exit(failures ? 1 : 0);
};

await main();
