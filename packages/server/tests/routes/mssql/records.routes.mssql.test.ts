import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HTTPException } from "hono/http-exception";

import { createServer } from "@/utils/create-server.js";
import * as mssqlAddRecordDao from "@/dao/mssql/add-record.mssql.dao.js";
import * as mssqlUpdateRecordsDao from "@/dao/mssql/update-records.mssql.dao.js";
import * as mssqlDeleteRecordsDao from "@/dao/mssql/delete-records.mssql.dao.js";
import * as mssqlBulkInsertDao from "@/dao/mssql/bulk-insert-records.mssql.dao.js";

vi.mock("@/dao/mssql/add-record.mssql.dao.js", () => ({
	addRecord: vi.fn(),
}));

vi.mock("@/dao/mssql/update-records.mssql.dao.js", () => ({
	updateRecords: vi.fn(),
}));

vi.mock("@/dao/mssql/delete-records.mssql.dao.js", () => ({
	deleteRecords: vi.fn(),
	forceDeleteRecords: vi.fn(),
}));

vi.mock("@/dao/mssql/bulk-insert-records.mssql.dao.js", () => ({
	bulkInsertRecords: vi.fn(),
}));

vi.mock("@/dao/add-record.dao.js", () => ({ addRecord: vi.fn() }));
vi.mock("@/dao/update-records.dao.js", () => ({ updateRecords: vi.fn() }));
vi.mock("@/dao/delete-records.dao.js", () => ({
	deleteRecords: vi.fn(),
	forceDeleteRecords: vi.fn(),
}));
vi.mock("@/dao/bulk-insert-records.dao.js", () => ({ bulkInsertRecords: vi.fn() }));
vi.mock("@/dao/mysql/add-record.mysql.dao.js", () => ({ addRecord: vi.fn() }));
vi.mock("@/dao/mysql/update-records.mysql.dao.js", () => ({ updateRecords: vi.fn() }));
vi.mock("@/dao/mysql/delete-records.mysql.dao.js", () => ({
	deleteRecords: vi.fn(),
	forceDeleteRecords: vi.fn(),
}));
vi.mock("@/dao/mysql/bulk-insert-records.mysql.dao.js", () => ({
	bulkInsertRecords: vi.fn(),
}));

vi.mock("@/db-manager.js", () => ({
	getDbPool: vi.fn(() => ({ query: vi.fn() })),
	getMysqlPool: vi.fn(() => ({ execute: vi.fn() })),
	getMssqlPool: vi.fn(async () => ({ request: vi.fn() })),
	getDbType: vi.fn(() => "mssql"),
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
			vi.mocked(mssqlAddRecordDao.addRecord).mockResolvedValue({ insertedCount: 1 });

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
			vi.mocked(mssqlAddRecordDao.addRecord).mockRejectedValue(
				new Error("connect ECONNREFUSED 127.0.0.1:1433")
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
			vi.mocked(mssqlUpdateRecordsDao.updateRecords).mockResolvedValue({ updatedCount: 2 });

			const res = await app.request("/mssql/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					tableName: "users",
					updates: [{ rowData: { id: 1 }, columnName: "name", value: "Updated" }],
				}),
			});

			expect(res.status).toBe(200);
			expect(mssqlUpdateRecordsDao.updateRecords).toHaveBeenCalledWith({
				params: expect.objectContaining({ primaryKey: "id" }),
				db: "testdb",
			});
		});

		it("returns 404 when record is not found", async () => {
			vi.mocked(mssqlUpdateRecordsDao.updateRecords).mockRejectedValue(
				new HTTPException(404, { message: "Record not found" })
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
			vi.mocked(mssqlDeleteRecordsDao.deleteRecords).mockResolvedValue({
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
			vi.mocked(mssqlDeleteRecordsDao.deleteRecords).mockResolvedValue({
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
			vi.mocked(mssqlDeleteRecordsDao.forceDeleteRecords).mockResolvedValue({
				deletedCount: 4,
			});

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
			vi.mocked(mssqlBulkInsertDao.bulkInsertRecords).mockResolvedValue({
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
			vi.mocked(mssqlAddRecordDao.addRecord).mockResolvedValue({ insertedCount: 1 });

			const responses = await Promise.all(
				Array.from({ length: 6 }, (_, i) =>
					app.request("/mssql/records?db=testdb", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							tableName: "users",
							data: { name: `User ${i}` },
						}),
					})
				)
			);

			for (const res of responses) {
				expect(res.status).toBe(200);
			}
			expect(mssqlAddRecordDao.addRecord).toHaveBeenCalledTimes(6);
		});
	});
});
