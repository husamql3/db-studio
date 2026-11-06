import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetMysqlPool = vi.hoisted(() => vi.fn());

vi.mock("@/open-connections.js", () => ({ connector: () => ({ pool: mockGetMysqlPool }) }));

import { MySqlAdapter } from "@/adapters/mysql/mysql.adapter.js";

const rows = (data: unknown[]) => [data, []] as const;
const ok = (affectedRows = 1) => [{ affectedRows }, undefined] as const;

describe("MySqlAdapter.renameTable", () => {
	let adapter: MySqlAdapter;
	let statements: string[];
	const existing = ["users", "orders", "we`ird"];

	beforeEach(() => {
		vi.clearAllMocks();
		adapter = new MySqlAdapter();
		statements = [];

		const pool = {
			getConnection: vi.fn(),
			execute: vi.fn(async (sql: string, values?: unknown[]) => {
				const text = String(sql);
				statements.push(text);

				// The column lookup that tells whether a table exists.
				if (text.includes("information_schema.COLUMNS")) {
					return rows(existing.includes(values?.[0] as string) ? [{ name: "id" }] : []);
				}

				return ok(1);
			}),
		};

		mockGetMysqlPool.mockReturnValue(pool);
	});

	it("renames an existing table with RENAME TABLE", async () => {
		await adapter.renameTable({ db: "appdb", tableName: "users", newTableName: "members" });
		expect(statements.at(-1)).toBe("RENAME TABLE `users` TO `members`");
	});

	it("escapes backticks in identifiers", async () => {
		await adapter.renameTable({ db: "appdb", tableName: "we`ird", newTableName: "ok" });
		expect(statements.at(-1)).toBe("RENAME TABLE `we``ird` TO `ok`");
	});
});
