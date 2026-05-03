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

describe("Query Routes (MongoDB)", () => {
	let app: ReturnType<typeof createServer>["app"];

	beforeEach(() => {
		vi.clearAllMocks();
		const server = createServer();
		app = server.app;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("POST /mongodb/query", () => {
		it("executes a find query and returns results with 200", async () => {
			const mockResult = {
				columns: ["_id", "name", "email"],
				rows: [
					{ _id: "507f1f77bcf86cd799439011", name: "Alice", email: "alice@example.com" },
					{ _id: "507f1f77bcf86cd799439012", name: "Bob", email: "bob@example.com" },
				],
				rowCount: 2,
				duration: 8.4,
			};
			mockDao.executeQuery.mockResolvedValue(mockResult);

			const query = JSON.stringify({
				collection: "users",
				operation: "find",
				filter: { age: { $gt: 18 } },
				limit: 50,
			});

			const res = await app.request("/mongodb/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query }),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockResult);
			expect(mockDao.executeQuery).toHaveBeenCalledWith({ query, db: "testdb" });
		});

		it("executes an aggregate pipeline query", async () => {
			mockDao.executeQuery.mockResolvedValue({
				columns: ["_id", "count"],
				rows: [
					{ _id: "NYC", count: 342 },
					{ _id: "LA", count: 198 },
				],
				rowCount: 2,
				duration: 15.2,
			});

			const query = JSON.stringify({
				collection: "orders",
				operation: "aggregate",
				pipeline: [
					{ $group: { _id: "$city", count: { $sum: 1 } } },
					{ $sort: { count: -1 } },
				],
			});

			const res = await app.request("/mongodb/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query }),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.rowCount).toBe(2);
		});

		it("executes an insertOne operation", async () => {
			mockDao.executeQuery.mockResolvedValue({
				columns: [],
				rows: [],
				rowCount: 1,
				duration: 5.1,
				message: "OK",
			});

			const query = JSON.stringify({
				collection: "users",
				operation: "insertOne",
				document: { name: "Charlie", email: "charlie@example.com" },
			});

			const res = await app.request("/mongodb/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query }),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.rowCount).toBe(1);
			expect(json.data.message).toBe("OK");
		});

		it("executes an insertMany operation", async () => {
			mockDao.executeQuery.mockResolvedValue({
				columns: [],
				rows: [],
				rowCount: 3,
				duration: 6.3,
				message: "OK",
			});

			const query = JSON.stringify({
				collection: "products",
				operation: "insertMany",
				document: [
					{ name: "Widget A", price: 9.99 },
					{ name: "Widget B", price: 14.99 },
					{ name: "Widget C", price: 4.99 },
				],
			});

			const res = await app.request("/mongodb/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query }),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.rowCount).toBe(3);
		});

		it("executes an updateOne operation", async () => {
			mockDao.executeQuery.mockResolvedValue({
				columns: [],
				rows: [],
				rowCount: 1,
				duration: 4.8,
				message: "OK (1 modified)",
			});

			const query = JSON.stringify({
				collection: "users",
				operation: "updateOne",
				filter: { _id: "507f1f77bcf86cd799439011" },
				update: { $set: { age: 31 } },
			});

			const res = await app.request("/mongodb/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query }),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.message).toBe("OK (1 modified)");
		});

		it("executes an updateMany operation", async () => {
			mockDao.executeQuery.mockResolvedValue({
				columns: [],
				rows: [],
				rowCount: 5,
				duration: 9.2,
				message: "OK (5 modified)",
			});

			const query = JSON.stringify({
				collection: "users",
				operation: "updateMany",
				filter: { active: false },
				update: { $set: { status: "inactive" } },
			});

			const res = await app.request("/mongodb/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query }),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.message).toContain("modified");
		});

		it("executes a deleteOne operation", async () => {
			mockDao.executeQuery.mockResolvedValue({
				columns: [],
				rows: [],
				rowCount: 1,
				duration: 3.5,
				message: "OK",
			});

			const query = JSON.stringify({
				collection: "users",
				operation: "deleteOne",
				filter: { _id: "507f1f77bcf86cd799439011" },
			});

			const res = await app.request("/mongodb/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query }),
			});

			expect(res.status).toBe(200);
		});

		it("executes a deleteMany operation", async () => {
			mockDao.executeQuery.mockResolvedValue({
				columns: [],
				rows: [],
				rowCount: 10,
				duration: 7.1,
				message: "OK",
			});

			const query = JSON.stringify({
				collection: "sessions",
				operation: "deleteMany",
				filter: { expiresAt: { $lt: "2025-01-01" } },
			});

			const res = await app.request("/mongodb/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query }),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.rowCount).toBe(10);
		});

		it("executes a count operation", async () => {
			mockDao.executeQuery.mockResolvedValue({
				columns: ["count"],
				rows: [{ count: 1542 }],
				rowCount: 1542,
				duration: 2.1,
				message: "OK",
			});

			const query = JSON.stringify({
				collection: "users",
				operation: "count",
				filter: { active: true },
			});

			const res = await app.request("/mongodb/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query }),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.rows[0].count).toBe(1542);
		});

		it("returns 400 for empty query string", async () => {
			mockDao.executeQuery.mockRejectedValue(
				new HTTPException(400, { message: "Query is required" }),
			);

			const res = await app.request("/mongodb/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "" }),
			});

			expect(res.status).toBe(400);
		});

		it("returns 400 for invalid JSON query payload", async () => {
			mockDao.executeQuery.mockRejectedValue(
				new HTTPException(400, { message: "Mongo query must be valid JSON" }),
			);

			const res = await app.request("/mongodb/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "not json" }),
			});

			expect(res.status).toBe(400);
		});

		it("returns 400 when collection or operation is missing", async () => {
			mockDao.executeQuery.mockRejectedValue(
				new HTTPException(400, {
					message: "Mongo query must include collection and operation",
				}),
			);

			const res = await app.request("/mongodb/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: JSON.stringify({ collection: "users" }) }),
			});

			expect(res.status).toBe(400);
		});

		it("returns 400 for unsupported operation", async () => {
			mockDao.executeQuery.mockRejectedValue(
				new HTTPException(400, { message: "Unsupported Mongo operation" }),
			);

			const res = await app.request("/mongodb/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: JSON.stringify({ collection: "users", operation: "drop" }),
				}),
			});

			expect(res.status).toBe(400);
		});

		it("returns 400 when request body is missing query field", async () => {
			const res = await app.request("/mongodb/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(400);
		});

		it("returns 400 when db param is missing", async () => {
			const res = await app.request("/mongodb/query", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: JSON.stringify({ collection: "users", operation: "find" }),
				}),
			});

			expect(res.status).toBe(400);
		});

		it("returns 503 on connection failure", async () => {
			mockDao.executeQuery.mockRejectedValue(
				new Error("connect ECONNREFUSED 127.0.0.1:27017"),
			);

			const res = await app.request("/mongodb/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: JSON.stringify({ collection: "users", operation: "find" }),
				}),
			});

			expect(res.status).toBe(503);
		});

		it("returns 503 on connection timeout", async () => {
			mockDao.executeQuery.mockRejectedValue(new Error("timeout expired"));

			const res = await app.request("/mongodb/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: JSON.stringify({ collection: "users", operation: "find" }),
				}),
			});

			expect(res.status).toBe(503);
		});

		it("includes duration in response", async () => {
			mockDao.executeQuery.mockResolvedValue({
				columns: ["_id"],
				rows: [{ _id: "507f1f77bcf86cd799439011" }],
				rowCount: 1,
				duration: 12.7,
			});

			const res = await app.request("/mongodb/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: JSON.stringify({ collection: "users", operation: "find" }),
				}),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.duration).toBe(12.7);
		});
	});
});
