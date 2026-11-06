import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetDbPool = vi.hoisted(() => vi.fn());

vi.mock("@/open-connections.js", () => ({ connector: () => ({ pool: mockGetDbPool }) }));

import { PgAdapter } from "@/adapters/pg/pg.adapter.js";

const result = (rows: unknown[] = []) => ({ rows, rowCount: rows.length, fields: [] });

describe("PgAdapter.renameTable", () => {
	let adapter: PgAdapter;
	let statements: string[];

	// Simulated information_schema: which schemas contain each table name.
	const schemasByTable: Record<string, string[]> = {
		users: ["public"],
		accounts: ["public", "audit"],
		product: ["analytics"],
		item: ["analytics"],
		legacy: ["archive", "backup"],
		'we"ird': ["public"],
	};

	beforeEach(() => {
		vi.clearAllMocks();
		adapter = new PgAdapter();
		statements = [];

		const pool = {
			query: vi.fn(async (sql: string, values?: unknown[]) => {
				const text = String(sql);
				statements.push(text);

				if (text.includes('table_schema as "schemaName"')) {
					const name = values?.[0] as string;

					return result((schemasByTable[name] ?? []).map((s) => ({ schemaName: s })));
				}

				if (text.includes("SELECT EXISTS") && text.includes("information_schema.tables")) {
					const [target, schema] = values as [string, string];

					return result([{ exists: (schemasByTable[target] ?? []).includes(schema) }]);
				}

				return result([]);
			}),
		};

		mockGetDbPool.mockReturnValue(pool);
	});

	it("renames a public table", async () => {
		await adapter.renameTable({ db: "appdb", tableName: "users", newTableName: "members" });
		expect(statements.at(-1)).toBe('ALTER TABLE "public"."users" RENAME TO "members"');
	});

	it("renames a table living in a non-public schema", async () => {
		await adapter.renameTable({ db: "appdb", tableName: "product", newTableName: "goods" });
		expect(statements.at(-1)).toBe('ALTER TABLE "analytics"."product" RENAME TO "goods"');
	});

	it("renames the explicitly selected schema when table names overlap", async () => {
		await adapter.renameTable({
			db: "appdb",
			tableName: "accounts",
			newTableName: "archived_accounts",
			schemaName: "audit",
		});
		expect(statements.at(-1)).toBe(
			'ALTER TABLE "audit"."accounts" RENAME TO "archived_accounts"',
		);
	});

	it("rejects a rename aimed at a schema the table is not in", async () => {
		await expect(
			adapter.renameTable({
				db: "appdb",
				tableName: "accounts",
				newTableName: "archived_accounts",
				schemaName: "reporting",
			}),
		).rejects.toMatchObject({ status: 404 });
	});

	it("escapes double quotes in identifiers", async () => {
		await adapter.renameTable({ db: "appdb", tableName: 'we"ird', newTableName: "ok" });
		expect(statements.at(-1)).toBe('ALTER TABLE "public"."we""ird" RENAME TO "ok"');
	});

	it("returns 404 when the table does not exist in any schema", async () => {
		await expect(
			adapter.renameTable({ db: "appdb", tableName: "ghost", newTableName: "spook" }),
		).rejects.toMatchObject({ status: 404 });
	});

	it("returns 409 when the target name exists in the same schema", async () => {
		await expect(
			adapter.renameTable({ db: "appdb", tableName: "product", newTableName: "item" }),
		).rejects.toMatchObject({ status: 409 });
	});

	it("returns 400 when the table exists in multiple non-public schemas", async () => {
		await expect(
			adapter.renameTable({ db: "appdb", tableName: "legacy", newTableName: "modern" }),
		).rejects.toMatchObject({ status: 400 });
	});
});
