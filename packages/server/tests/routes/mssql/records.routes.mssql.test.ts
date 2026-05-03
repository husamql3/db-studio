import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HTTPException } from "hono/http-exception";

import { createServer } from "@/utils/create-server.js";

const mockDao = vi.hoisted(() => ({
	getDatabasesList: vi.fn(),
	getCurrentDatabase: vi.fn(),
	getDatabaseConnectionInfo: vi.fn(),
	getTablesList: vi.fn(),
	createTable: vi.fn(),
	deleteTable: vi.fn(),
	getTableSchema: vi.fn(),
	getTableColumns: vi.fn(),
	addColumn: vi.fn(),
	deleteColumn: vi.fn(),
	alterColumn: vi.fn(),
	renameColumn: vi.fn(),
	getTableData: vi.fn(),
	addRecord: vi.fn(),
	updateRecords: vi.fn(),
	deleteRecords: vi.fn(),
	forceDeleteRecords: vi.fn(),
	bulkInsertRecords: vi.fn(),
	exportTableData: vi.fn(),
	executeQuery: vi.fn(),
}));

vi.mock("@/dao/dao-factory.js", () => ({
	getDaoFactory: vi.fn(() => mockDao),
	executeDaoMethod: vi.fn(),
}));

vi.mock("@/db-manager.js", () => ({
	getDbPool: vi.fn(() => ({ query: vi.fn() })),
	getMysqlPool: vi.fn(() => ({ execute: vi.fn() })),
	getMssqlPool: vi.fn(async () => ({ request: vi.fn() })),
	getDbType: vi.fn(() => "mssql"),
	isValidObjectId: vi.fn(),
	coerceObjectId: vi.fn(),
}));

describe("Records Routes (MSSQL)", () => {
	let app: ReturnType<typeof createServer>["app"];

	beforeEach(() => {
		vi.clearAllMocks();
		const server = createServer();
		app = server.app;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("POST /mssql/records", () => {
		it("adds a record and returns success message", async () => {
			mockDao.addRecord.mockResolvedValue({ insertedCount: 1 });

			const res = await app.request("/mssql/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					tableName: "users",
					data: { name: "Ali", age: 25 },
				}),
			});
			const json = await res.json();

			expect(res.status).toBe(200);
			expect(json.data).toContain('Record inserted into "users"');
		});

		it("returns 400 for invalid payload", async () => {
			const res = await app.request("/mssql/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ data: { name: "Ali" } }),
			});

			expect(res.status).toBe(400);
		});

		it("returns 503 when connection fails", async () => {
			mockDao.addRecord.mockRejectedValue(
				new Error("connect ECONNREFUSED 127.0.0.1:1433"),
			);

			const res = await app.request("/mssql/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users", data: { name: "Ali" } }),
			});

			expect(res.status).toBe(503);
		});
	});

	describe("PATCH /mssql/records", () => {
		it("updates records with default primary key", async () => {
			mockDao.updateRecords.mockResolvedValue({ updatedCount: 2 });

			const res = await app.request("/mssql/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					tableName: "users",
					updates: [{ rowData: { id: 1 }, columnName: "name", value: "Updated" }],
				}),
			});

			expect(res.status).toBe(200);
			expect(mockDao.updateRecords).toHaveBeenCalledWith({
				params: expect.objectContaining({ primaryKey: "id" }),
				db: "testdb",
			});
		});

		it("returns 404 when record is not found", async () => {
			mockDao.updateRecords.mockRejectedValue(
				new HTTPException(404, { message: "Record not found" }),
			);

			const res = await app.request("/mssql/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					tableName: "users",
					primaryKey: "id",
					updates: [{ rowData: { id: 999 }, columnName: "name", value: "Updated" }],
				}),
			});

			expect(res.status).toBe(404);
		});
	});

	describe("DELETE /mssql/records", () => {
		it("deletes records", async () => {
			mockDao.deleteRecords.mockResolvedValue({
				deletedCount: 1,
				fkViolation: false,
				relatedRecords: [],
			});

			const res = await app.request("/mssql/records?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					tableName: "users",
					primaryKeys: [{ columnName: "id", value: 1 }],
				}),
			});
			const json = await res.json();

			expect(res.status).toBe(200);
			expect(json.data.deletedCount).toBe(1);
		});

		it("returns 409 on FK violation", async () => {
			mockDao.deleteRecords.mockResolvedValue({
				deletedCount: 0,
				fkViolation: true,
				relatedRecords: [
					{
						tableName: "orders",
						columnName: "user_id",
						constraintName: "fk_orders_user_id",
						records: [{ id: 1, user_id: 1 }],
					},
				],
			});

			const res = await app.request("/mssql/records?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					tableName: "users",
					primaryKeys: [{ columnName: "id", value: 1 }],
				}),
			});

			expect(res.status).toBe(409);
		});
	});

	describe("DELETE /mssql/records/force", () => {
		it("force deletes records", async () => {
			mockDao.forceDeleteRecords.mockResolvedValue({ deletedCount: 4 });

			const res = await app.request("/mssql/records/force?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					tableName: "users",
					primaryKeys: [{ columnName: "id", value: 1 }],
				}),
			});
			const json = await res.json();

			expect(res.status).toBe(200);
			expect(json.data.deletedCount).toBe(4);
		});
	});

	describe("POST /mssql/records/bulk", () => {
		it("bulk inserts records", async () => {
			mockDao.bulkInsertRecords.mockResolvedValue({
				success: true,
				message: "Bulk insert completed",
				successCount: 2,
				failureCount: 0,
			});

			const res = await app.request("/mssql/records/bulk?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					tableName: "users",
					records: [{ name: "A" }, { name: "B" }],
				}),
			});
			const json = await res.json();

			expect(res.status).toBe(200);
			expect(json.data.success).toBe(true);
			expect(json.data.successCount).toBe(2);
		});
	});

	describe("Validation and behavior", () => {
		it("rejects invalid database type", async () => {
			const res = await app.request("/invalid/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users", data: { name: "X" } }),
			});
			expect(res.status).toBe(400);
		});

		it("returns 404 for unsupported methods", async () => {
			const res = await app.request("/mssql/records?db=testdb", { method: "GET" });
			expect(res.status).toBe(404);
		});

		it("handles concurrent insert requests", async () => {
			mockDao.addRecord.mockResolvedValue({ insertedCount: 1 });

			const responses = await Promise.all(
				Array.from({ length: 6 }, (_, i) =>
					app.request("/mssql/records?db=testdb", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							tableName: "users",
							data: { name: `User ${i}` },
						}),
					}),
				),
			);

			for (const res of responses) {
				expect(res.status).toBe(200);
			}
			expect(mockDao.addRecord).toHaveBeenCalledTimes(6);
		});
	});
});
