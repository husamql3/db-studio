import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HTTPException } from "hono/http-exception";

import { createServer } from "@/utils/create-server.js";
import * as mongoAddRecordDao from "@/dao/mongo/add-record.mongo.dao.js";
import * as mongoBulkInsertDao from "@/dao/mongo/bulk-insert-records.mongo.dao.js";
import * as mongoDeleteRecordsDao from "@/dao/mongo/delete-records.mongo.dao.js";
import * as mongoUpdateRecordsDao from "@/dao/mongo/update-records.mongo.dao.js";

// Mock MongoDB DAO modules
vi.mock("@/dao/mongo/add-record.mongo.dao.js", () => ({ addRecord: vi.fn() }));
vi.mock("@/dao/mongo/update-records.mongo.dao.js", () => ({ updateRecords: vi.fn() }));
vi.mock("@/dao/mongo/delete-records.mongo.dao.js", () => ({
	deleteRecords: vi.fn(),
	forceDeleteRecords: vi.fn(),
}));

vi.mock("@/dao/mongo/bulk-insert-records.mongo.dao.js", () => ({
	bulkInsertRecords: vi.fn(),
}));

// Stub PG DAO modules
vi.mock("@/dao/add-record.dao.js", () => ({ addRecord: vi.fn() }));
vi.mock("@/dao/update-records.dao.js", () => ({ updateRecords: vi.fn() }));
vi.mock("@/dao/delete-records.dao.js", () => ({
	deleteRecords: vi.fn(),
	forceDeleteRecords: vi.fn(),
}));
vi.mock("@/dao/bulk-insert-records.dao.js", () => ({ bulkInsertRecords: vi.fn() }));

// Stub MySQL DAO modules
vi.mock("@/dao/mysql/add-record.mysql.dao.js", () => ({ addRecord: vi.fn() }));
vi.mock("@/dao/mysql/update-records.mysql.dao.js", () => ({ updateRecords: vi.fn() }));
vi.mock("@/dao/mysql/delete-records.mysql.dao.js", () => ({
	deleteRecords: vi.fn(),
	forceDeleteRecords: vi.fn(),
}));
vi.mock("@/dao/mysql/bulk-insert-records.mysql.dao.js", () => ({ bulkInsertRecords: vi.fn() }));

vi.mock("@/db-manager.js", () => ({
	getDbPool: vi.fn(),
	getMysqlPool: vi.fn(),
	getMssqlPool: vi.fn(),
	getMongoClient: vi.fn(),
	getMongoDb: vi.fn(),
	getMongoDbName: vi.fn(() => "testdb"),
	isValidObjectId: vi.fn(() => false),
	coerceObjectId: vi.fn((v) => v),
	getDbType: vi.fn(() => "mongodb"),
}));

describe("Records Routes (MongoDB)", () => {
	let app: ReturnType<typeof createServer>["app"];

	beforeEach(() => {
		vi.clearAllMocks();
		const server = createServer();
		app = server.app;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ============================================
	// POST /mongodb/records - add document
	// ============================================
	describe("POST /mongodb/records", () => {
		it("inserts a document and returns 200", async () => {
			vi.mocked(mongoAddRecordDao.addRecord).mockResolvedValue({ insertedCount: 1 });

			const body = {
				tableName: "users",
				data: { name: "Alice", email: "alice@example.com", age: 30 },
			};

			const res = await app.request("/mongodb/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toBe('Record inserted into "users" with 1 rows inserted');
			expect(mongoAddRecordDao.addRecord).toHaveBeenCalledWith({
				db: "testdb",
				params: { tableName: "users", data: body.data },
			});
		});

		it("handles document with nested object", async () => {
			vi.mocked(mongoAddRecordDao.addRecord).mockResolvedValue({ insertedCount: 1 });

			const body = {
				tableName: "orders",
				data: {
					userId: "507f1f77bcf86cd799439011",
					items: [{ productId: "p1", quantity: 2 }],
					address: { city: "NY", zip: "10001" },
				},
			};

			const res = await app.request("/mongodb/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
		});

		it("handles document with explicit _id provided", async () => {
			vi.mocked(mongoAddRecordDao.addRecord).mockResolvedValue({ insertedCount: 1 });

			const body = {
				tableName: "configs",
				data: { _id: "507f1f77bcf86cd799439011", key: "theme", value: "dark" },
			};

			const res = await app.request("/mongodb/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
		});

		it("returns 400 when tableName is missing", async () => {
			const res = await app.request("/mongodb/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ data: { name: "Alice" } }),
			});

			expect(res.status).toBe(400);
		});

		it("returns 400 when db param is missing", async () => {
			const res = await app.request("/mongodb/records", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users", data: {} }),
			});

			expect(res.status).toBe(400);
		});

		it("returns 500 when insert fails", async () => {
			vi.mocked(mongoAddRecordDao.addRecord).mockRejectedValue(
				new HTTPException(500, { message: 'Failed to insert record into "users"' }),
			);

			const res = await app.request("/mongodb/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users", data: { name: "Bob" } }),
			});

			expect(res.status).toBe(500);
		});

		it("returns 503 on connection failure", async () => {
			vi.mocked(mongoAddRecordDao.addRecord).mockRejectedValue(
				new Error("connect ECONNREFUSED 127.0.0.1:27017"),
			);

			const res = await app.request("/mongodb/records?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users", data: { name: "Bob" } }),
			});

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// PATCH /mongodb/records - update documents
	// ============================================
	describe("PATCH /mongodb/records", () => {
		it("updates documents and returns 200 with updatedCount", async () => {
			vi.mocked(mongoUpdateRecordsDao.updateRecords).mockResolvedValue({ updatedCount: 2 });

			const body = {
				tableName: "users",
				primaryKey: "_id",
				updates: [
					{
						rowData: { _id: "507f1f77bcf86cd799439011" },
						columnName: "age",
						value: 31,
					},
					{
						rowData: { _id: "507f1f77bcf86cd799439011" },
						columnName: "name",
						value: "Alice Updated",
					},
				],
			};

			const res = await app.request("/mongodb/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toBe('Updated 2 records in "users"');
			expect(mongoUpdateRecordsDao.updateRecords).toHaveBeenCalledWith({
				db: "testdb",
				params: {
					tableName: "users",
					primaryKey: "_id",
					updates: body.updates,
				},
			});
		});

		it("returns 0 updated records for no-op update", async () => {
			vi.mocked(mongoUpdateRecordsDao.updateRecords).mockResolvedValue({ updatedCount: 0 });

			const res = await app.request("/mongodb/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					tableName: "users",
					primaryKey: "_id",
					updates: [
						{
							rowData: { _id: "507f1f77bcf86cd799439011" },
							columnName: "name",
							value: "Same Name",
						},
					],
				}),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toBe('Updated 0 records in "users"');
		});

		it("returns 404 when document not found", async () => {
			vi.mocked(mongoUpdateRecordsDao.updateRecords).mockRejectedValue(
				new HTTPException(404, {
					message: 'Record with _id = 507f1f77bcf86cd799439011 not found in "users"',
				}),
			);

			const res = await app.request("/mongodb/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					tableName: "users",
					primaryKey: "_id",
					updates: [
						{
							rowData: { _id: "507f1f77bcf86cd799439011" },
							columnName: "name",
							value: "Ghost",
						},
					],
				}),
			});

			expect(res.status).toBe(404);
		});

		it("returns 400 when primary key is missing in row data", async () => {
			vi.mocked(mongoUpdateRecordsDao.updateRecords).mockRejectedValue(
				new HTTPException(400, { message: 'Primary key "_id" not found in row data.' }),
			);

			const res = await app.request("/mongodb/records?db=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					tableName: "users",
					primaryKey: "_id",
					updates: [{ rowData: {}, columnName: "name", value: "Bob" }],
				}),
			});

			expect(res.status).toBe(400);
		});
	});

	// ============================================
	// DELETE /mongodb/records - delete documents
	// ============================================
	describe("DELETE /mongodb/records", () => {
		it("deletes documents and returns 200", async () => {
			vi.mocked(mongoDeleteRecordsDao.deleteRecords).mockResolvedValue({
				deletedCount: 2,
				fkViolation: false,
				relatedRecords: [],
			});

			const body = {
				tableName: "users",
				primaryKeys: [
					{ columnName: "_id", value: "507f1f77bcf86cd799439011" },
					{ columnName: "_id", value: "507f1f77bcf86cd799439012" },
				],
			};

			const res = await app.request("/mongodb/records?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.deletedCount).toBe(2);
			expect(json.data.fkViolation).toBe(false);
		});

		it("deletes a single document", async () => {
			vi.mocked(mongoDeleteRecordsDao.deleteRecords).mockResolvedValue({
				deletedCount: 1,
				fkViolation: false,
				relatedRecords: [],
			});

			const body = {
				tableName: "orders",
				primaryKeys: [{ columnName: "_id", value: "507f1f77bcf86cd799439011" }],
			};

			const res = await app.request("/mongodb/records?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.deletedCount).toBe(1);
		});

		it("returns 0 deleted when no documents matched", async () => {
			vi.mocked(mongoDeleteRecordsDao.deleteRecords).mockResolvedValue({
				deletedCount: 0,
				fkViolation: false,
				relatedRecords: [],
			});

			const res = await app.request("/mongodb/records?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					tableName: "users",
					primaryKeys: [{ columnName: "_id", value: "507f1f77bcf86cd799439099" }],
				}),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.deletedCount).toBe(0);
		});

		it("returns 400 when body is invalid", async () => {
			const res = await app.request("/mongodb/records?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users" }),
			});

			expect(res.status).toBe(400);
		});

		it("returns 503 on connection failure", async () => {
			vi.mocked(mongoDeleteRecordsDao.deleteRecords).mockRejectedValue(
				new Error("connect ECONNREFUSED"),
			);

			const res = await app.request("/mongodb/records?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					tableName: "users",
					primaryKeys: [{ columnName: "_id", value: "507f1f77bcf86cd799439011" }],
				}),
			});

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// DELETE /mongodb/records/force - force delete
	// ============================================
	describe("DELETE /mongodb/records/force", () => {
		it("force deletes documents and returns 200", async () => {
			vi.mocked(mongoDeleteRecordsDao.forceDeleteRecords).mockResolvedValue({
				deletedCount: 3,
			});

			const body = {
				tableName: "users",
				primaryKeys: [
					{ columnName: "_id", value: "507f1f77bcf86cd799439011" },
					{ columnName: "_id", value: "507f1f77bcf86cd799439012" },
					{ columnName: "_id", value: "507f1f77bcf86cd799439013" },
				],
			};

			const res = await app.request("/mongodb/records/force?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.deletedCount).toBe(3);
		});

		it("returns 503 on connection failure", async () => {
			vi.mocked(mongoDeleteRecordsDao.forceDeleteRecords).mockRejectedValue(
				new Error("connection refused"),
			);

			const res = await app.request("/mongodb/records/force?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					tableName: "users",
					primaryKeys: [{ columnName: "_id", value: "507f1f77bcf86cd799439011" }],
				}),
			});

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// POST /mongodb/records/bulk - bulk insert
	// ============================================
	describe("POST /mongodb/records/bulk", () => {
		it("bulk inserts documents and returns 200", async () => {
			vi.mocked(mongoBulkInsertDao.bulkInsertRecords).mockResolvedValue({
				success: true,
				message: "Successfully inserted 3 records",
				successCount: 3,
				failureCount: 0,
			});

			const body = {
				tableName: "users",
				records: [
					{ name: "Alice", email: "alice@example.com" },
					{ name: "Bob", email: "bob@example.com" },
					{ name: "Carol", email: "carol@example.com" },
				],
			};

			const res = await app.request("/mongodb/records/bulk?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.successCount).toBe(3);
			expect(json.data.failureCount).toBe(0);
		});

		it("handles partial bulk insert failure", async () => {
			vi.mocked(mongoBulkInsertDao.bulkInsertRecords).mockResolvedValue({
				success: true,
				message: "Successfully inserted 2 records",
				successCount: 2,
				failureCount: 1,
			});

			const res = await app.request("/mongodb/records/bulk?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					tableName: "users",
					records: [{ name: "A" }, { name: "B" }, {}],
				}),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.failureCount).toBe(1);
		});

		it("returns 400 when records array is empty", async () => {
			vi.mocked(mongoBulkInsertDao.bulkInsertRecords).mockRejectedValue(
				new HTTPException(400, { message: "At least one record is required" }),
			);

			const res = await app.request("/mongodb/records/bulk?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "users", records: [] }),
			});

			expect(res.status).toBe(400);
		});

		it("returns 500 when bulk insert fails at DB level", async () => {
			vi.mocked(mongoBulkInsertDao.bulkInsertRecords).mockRejectedValue(
				new HTTPException(500, { message: "Bulk insert failed: duplicate key error" }),
			);

			const res = await app.request("/mongodb/records/bulk?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					tableName: "users",
					records: [{ _id: "dup", name: "Test" }],
				}),
			});

			expect(res.status).toBe(500);
		});

		it("returns 400 when tableName is missing", async () => {
			const res = await app.request("/mongodb/records/bulk?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ records: [{ name: "Alice" }] }),
			});

			expect(res.status).toBe(400);
		});
	});
});
