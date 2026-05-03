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

vi.mock("@/adapters/adapter.registry.js", () => ({
	getAdapter: vi.fn(() => mockDao),
	adapterRegistry: {
		register: vi.fn(),
		get: vi.fn(() => mockDao),
		has: vi.fn((type: string) => ["pg", "mysql", "mssql", "mongodb"].includes(type)),
		getSupportedTypes: vi.fn(() => ["pg", "mysql", "mssql", "mongodb"]),
	},
}));

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

	describe("POST /mongodb/records", () => {
		it("inserts a document and returns 200", async () => {
			mockDao.addRecord.mockResolvedValue({ insertedCount: 1 });

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
			expect(mockDao.addRecord).toHaveBeenCalledWith({
				db: "testdb",
				params: { tableName: "users", data: body.data },
			});
		});

		it("handles document with nested object", async () => {
			mockDao.addRecord.mockResolvedValue({ insertedCount: 1 });

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
			mockDao.addRecord.mockResolvedValue({ insertedCount: 1 });

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
			mockDao.addRecord.mockRejectedValue(
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
			mockDao.addRecord.mockRejectedValue(
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

	describe("PATCH /mongodb/records", () => {
		it("updates documents and returns 200 with updatedCount", async () => {
			mockDao.updateRecords.mockResolvedValue({ updatedCount: 2 });

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
			expect(mockDao.updateRecords).toHaveBeenCalledWith({
				db: "testdb",
				params: {
					tableName: "users",
					primaryKey: "_id",
					updates: body.updates,
				},
			});
		});

		it("returns 0 updated records for no-op update", async () => {
			mockDao.updateRecords.mockResolvedValue({ updatedCount: 0 });

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
			mockDao.updateRecords.mockRejectedValue(
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
			mockDao.updateRecords.mockRejectedValue(
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

	describe("DELETE /mongodb/records", () => {
		it("deletes documents and returns 200", async () => {
			mockDao.deleteRecords.mockResolvedValue({
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
			mockDao.deleteRecords.mockResolvedValue({
				deletedCount: 1,
				fkViolation: false,
				relatedRecords: [],
			});

			const res = await app.request("/mongodb/records?db=testdb", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					tableName: "orders",
					primaryKeys: [{ columnName: "_id", value: "507f1f77bcf86cd799439011" }],
				}),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.deletedCount).toBe(1);
		});

		it("returns 0 deleted when no documents matched", async () => {
			mockDao.deleteRecords.mockResolvedValue({
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
			mockDao.deleteRecords.mockRejectedValue(new Error("connect ECONNREFUSED"));

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

	describe("DELETE /mongodb/records/force", () => {
		it("force deletes documents and returns 200", async () => {
			mockDao.forceDeleteRecords.mockResolvedValue({ deletedCount: 3 });

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
			mockDao.forceDeleteRecords.mockRejectedValue(new Error("connection refused"));

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

	describe("POST /mongodb/records/bulk", () => {
		it("bulk inserts documents and returns 200", async () => {
			mockDao.bulkInsertRecords.mockResolvedValue({
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
			mockDao.bulkInsertRecords.mockResolvedValue({
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
			mockDao.bulkInsertRecords.mockRejectedValue(
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
			mockDao.bulkInsertRecords.mockRejectedValue(
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
