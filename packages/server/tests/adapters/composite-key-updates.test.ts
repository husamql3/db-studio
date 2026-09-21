import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getDbPool: vi.fn(),
	getMysqlPool: vi.fn(),
	getMssqlPool: vi.fn(),
	getSqliteDb: vi.fn(),
	getMongoDb: vi.fn(),
}));

vi.mock("@/adapters/connections.js", () => ({
	getDbPool: mocks.getDbPool,
	getMysqlPool: mocks.getMysqlPool,
	getMssqlPool: mocks.getMssqlPool,
	getSqliteDb: mocks.getSqliteDb,
	getMongoDb: mocks.getMongoDb,
	getMongoClient: vi.fn(),
	getMongoDbName: vi.fn(),
	getRedisClient: vi.fn(),
	getIsolatedRedisClient: vi.fn(),
	getRedisDefaultDb: vi.fn(),
}));

import { MongoAdapter } from "@/adapters/mongo/mongo.adapter.js";
import { MsSqlAdapter } from "@/adapters/mssql/mssql.adapter.js";
import { MySqlAdapter } from "@/adapters/mysql/mysql.adapter.js";
import { PgAdapter } from "@/adapters/pg/pg.adapter.js";
import { SqliteAdapter } from "@/adapters/sqlite/sqlite.adapter.js";

/**
 * A `(tenant_id, user_id)` row where only the first key column is shared with
 * other records. Matching on `tenant_id` alone would hit every user of tenant 7.
 */
const compositeRow = { tenant_id: 7, user_id: 42, name: "Ada" };
const compositeParams = {
	tableName: "members",
	primaryKey: "tenant_id",
	primaryKeys: ["tenant_id", "user_id"],
	updates: [{ columnName: "name", value: "Grace", rowData: compositeRow }],
};

describe("composite primary key updates", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("PgAdapter", () => {
		it("matches on every key column", async () => {
			const statements: Array<{ sql: string; values: unknown[] }> = [];
			mocks.getDbPool.mockReturnValue({
				query: vi.fn(async (sql: string, values: unknown[] = []) => {
					statements.push({ sql, values });
					return { rows: [], rowCount: 1, fields: [] };
				}),
			});

			const adapter = new PgAdapter();
			await expect(
				adapter.updateRecords({ db: "appdb", params: compositeParams } as never),
			).resolves.toEqual({ updatedCount: 1 });

			const update = statements.find((s) => s.sql.startsWith("UPDATE"));
			expect(update?.sql).toContain('WHERE "tenant_id" = $2 AND "user_id" = $3');
			expect(update?.values).toEqual(["Grace", 7, 42]);
		});

		it("still matches on the single key column when no composite key is sent", async () => {
			const statements: Array<{ sql: string; values: unknown[] }> = [];
			mocks.getDbPool.mockReturnValue({
				query: vi.fn(async (sql: string, values: unknown[] = []) => {
					statements.push({ sql, values });
					return { rows: [], rowCount: 1, fields: [] };
				}),
			});

			const adapter = new PgAdapter();
			await adapter.updateRecords({
				db: "appdb",
				params: {
					tableName: "users",
					primaryKey: "id",
					updates: [{ columnName: "name", value: "Grace", rowData: { id: 1 } }],
				},
			} as never);

			const update = statements.find((s) => s.sql.startsWith("UPDATE"));
			expect(update?.sql).toContain('WHERE "id" = $2');
			expect(update?.values).toEqual(["Grace", 1]);
		});

		it("rejects a row that is missing one component of the key", async () => {
			mocks.getDbPool.mockReturnValue({ query: vi.fn(async () => ({ rows: [], rowCount: 1 })) });

			const adapter = new PgAdapter();
			await expect(
				adapter.updateRecords({
					db: "appdb",
					params: {
						...compositeParams,
						updates: [{ columnName: "name", value: "Grace", rowData: { tenant_id: 7 } }],
					},
				} as never),
			).rejects.toMatchObject({ status: 400 });
		});

		it("writes one statement per record when two rows share a key column", async () => {
			const statements: Array<{ sql: string; values: unknown[] }> = [];
			mocks.getDbPool.mockReturnValue({
				query: vi.fn(async (sql: string, values: unknown[] = []) => {
					statements.push({ sql, values });
					return { rows: [], rowCount: 1, fields: [] };
				}),
			});

			const adapter = new PgAdapter();
			await adapter.updateRecords({
				db: "appdb",
				params: {
					...compositeParams,
					updates: [
						{ columnName: "name", value: "Grace", rowData: compositeRow },
						{
							columnName: "name",
							value: "Linus",
							rowData: { tenant_id: 7, user_id: 43, name: "Bob" },
						},
					],
				},
			} as never);

			const updates = statements.filter((s) => s.sql.startsWith("UPDATE"));
			expect(updates).toHaveLength(2);
			expect(updates[0]?.values).toEqual(["Grace", 7, 42]);
			expect(updates[1]?.values).toEqual(["Linus", 7, 43]);
		});
	});

	describe("MySqlAdapter", () => {
		it("matches on every key column", async () => {
			const statements: Array<{ sql: string; values: unknown[] }> = [];
			const connection = {
				beginTransaction: vi.fn(),
				commit: vi.fn(),
				rollback: vi.fn(),
				release: vi.fn(),
				execute: vi.fn(async (sql: string, values: unknown[] = []) => {
					statements.push({ sql, values });
					return [{ affectedRows: 1 }];
				}),
			};
			mocks.getMysqlPool.mockReturnValue({
				getConnection: vi.fn(async () => connection),
				execute: vi.fn(async () => [[]]),
			});

			const adapter = new MySqlAdapter();
			vi.spyOn(adapter, "getTableColumns").mockResolvedValue([]);

			await expect(
				adapter.updateRecords({ db: "appdb", params: compositeParams } as never),
			).resolves.toEqual({ updatedCount: 1 });

			expect(statements[0]?.sql).toContain("WHERE `tenant_id` = ? AND `user_id` = ?");
			expect(statements[0]?.values).toEqual(["Grace", 7, 42]);
		});
	});

	describe("SqliteAdapter", () => {
		it("matches on every key column", async () => {
			const statements: Array<{ sql: string; values: unknown[] }> = [];
			mocks.getSqliteDb.mockReturnValue({
				transaction: (fn: () => number) => fn,
				prepare: (sql: string) => ({
					run: (...values: unknown[]) => {
						statements.push({ sql, values });
						return { changes: 1 };
					},
				}),
			});

			const adapter = new SqliteAdapter();
			await expect(
				adapter.updateRecords({ db: "appdb", params: compositeParams } as never),
			).resolves.toEqual({ updatedCount: 1 });

			expect(statements[0]?.sql).toContain('WHERE "tenant_id" = ? AND "user_id" = ?');
			expect(statements[0]?.values).toEqual(["Grace", 7, 42]);
		});
	});

	describe("MsSqlAdapter", () => {
		it("binds and matches on every key column", async () => {
			const inputs: Array<[string, unknown]> = [];
			const queries: string[] = [];
			const request = {
				input: vi.fn((name: string, value: unknown) => {
					inputs.push([name, value]);
					return request;
				}),
				query: vi.fn(async (sql: string) => {
					queries.push(sql);
					return { rowsAffected: [1] };
				}),
			};
			const transaction = {
				begin: vi.fn(),
				commit: vi.fn(),
				rollback: vi.fn(),
				request: () => request,
			};
			mocks.getMssqlPool.mockResolvedValue({ transaction: () => transaction });

			const adapter = new MsSqlAdapter();
			vi.spyOn(adapter, "getTableColumns").mockResolvedValue([]);

			await expect(
				adapter.updateRecords({ db: "appdb", params: compositeParams } as never),
			).resolves.toEqual({ updatedCount: 1 });

			expect(queries[0]).toContain("WHERE [tenant_id] = @pkValue0 AND [user_id] = @pkValue1");
			expect(inputs).toEqual([
				["value0", "Grace"],
				["pkValue0", 7],
				["pkValue1", 42],
			]);
		});
	});

	describe("MongoAdapter", () => {
		it("filters on every key column", async () => {
			const updateOne = vi.fn(async () => ({ matchedCount: 1, modifiedCount: 1 }));
			mocks.getMongoDb.mockResolvedValue({ collection: () => ({ updateOne }) });

			const adapter = new MongoAdapter();
			await expect(
				adapter.updateRecords({ db: "appdb", params: compositeParams } as never),
			).resolves.toEqual({ updatedCount: 1 });

			expect(updateOne).toHaveBeenCalledWith(
				{ tenant_id: 7, user_id: 42 },
				{ $set: { name: "Grace" } },
			);
		});

		it("rejects an attempt to update the immutable _id field", async () => {
			const updateOne = vi.fn(async () => ({ matchedCount: 1, modifiedCount: 1 }));
			mocks.getMongoDb.mockResolvedValue({ collection: () => ({ updateOne }) });

			const adapter = new MongoAdapter();
			await expect(
				adapter.updateRecords({
					db: "appdb",
					params: {
						tableName: "users",
						primaryKey: "_id",
						updates: [
							{ columnName: "_id", value: "other", rowData: { _id: "507f1f77bcf86cd799439011" } },
						],
					},
				} as never),
			).rejects.toMatchObject({ status: 400 });
			expect(updateOne).not.toHaveBeenCalled();
		});
	});
});
