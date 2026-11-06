import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetMssqlPool = vi.hoisted(() => vi.fn());

vi.mock("@/open-connections.js", () => ({ connector: () => ({ pool: mockGetMssqlPool }) }));

import { MsSqlAdapter } from "@/adapters/mssql/mssql.adapter.js";

describe("MsSqlAdapter.renameTable", () => {
	let adapter: MsSqlAdapter;
	let statements: string[];
	let boundParams: Record<string, unknown>[];
	const existing = ["users", "orders"];

	const createRenamePool = () => {
		const pool = {
			request: vi.fn(() => {
				const params: Record<string, unknown> = {};
				boundParams.push(params);

				const req = {
					input: vi.fn((name: string, value: unknown) => {
						params[name] = value;

						return req;
					}),
					query: vi.fn(async (sql: string) => {
						const text = String(sql);
						statements.push(text);

						// The column lookup that tells whether a table exists.
						if (text.includes("INFORMATION_SCHEMA.COLUMNS")) {
							return {
								recordset: existing.includes(params.p0 as string) ? [{ name: "id" }] : [],
								rowsAffected: [0],
							};
						}

						return { recordset: [], rowsAffected: [1] };
					}),
				};

				return req;
			}),
		};

		return pool;
	};

	beforeEach(() => {
		vi.clearAllMocks();
		adapter = new MsSqlAdapter();
		statements = [];
		boundParams = [];
		mockGetMssqlPool.mockResolvedValue(createRenamePool());
	});

	it("renames via parameterized sp_rename (no string interpolation)", async () => {
		await adapter.renameTable({ db: "appdb", tableName: "users", newTableName: "members" });
		expect(statements.at(-1)).toBe("EXEC sp_rename @p0, @p1");
		const renameParams = boundParams.at(-1);
		// sp_rename parses the old name, so it arrives quoted.
		expect(renameParams).toMatchObject({ p0: "[users]", p1: "members" });
	});
});
