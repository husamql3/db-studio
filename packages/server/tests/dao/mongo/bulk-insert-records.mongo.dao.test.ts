import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HTTPException } from "hono/http-exception";

let mockCollection: ReturnType<typeof makeMockCollection>;

const makeMockCollection = () => ({
	insertMany: vi.fn(),
});

const mockDb = {
	collection: vi.fn(() => mockCollection),
};

vi.mock("@/db-manager.js", () => ({
	getMongoDb: vi.fn(() => Promise.resolve(mockDb)),
	isValidObjectId: vi.fn(() => false),
	coerceObjectId: vi.fn((v) => v),
}));

import { bulkInsertRecords } from "@/dao/mongo/bulk-insert-records.mongo.dao.js";

describe("bulkInsertRecords (MongoDB)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockCollection = makeMockCollection();
		mockDb.collection.mockReturnValue(mockCollection);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("inserts multiple records and returns success result", async () => {
		mockCollection.insertMany.mockResolvedValue({ insertedCount: 3 });

		const result = await bulkInsertRecords({
			tableName: "users",
			records: [
				{ name: "Alice", email: "alice@example.com" },
				{ name: "Bob", email: "bob@example.com" },
				{ name: "Carol", email: "carol@example.com" },
			],
			db: "testdb",
		});

		expect(result.success).toBe(true);
		expect(result.successCount).toBe(3);
		expect(result.failureCount).toBe(0);
		expect(result.message).toContain("3");
	});

	it("inserts a single record", async () => {
		mockCollection.insertMany.mockResolvedValue({ insertedCount: 1 });

		const result = await bulkInsertRecords({
			tableName: "products",
			records: [{ name: "Widget", price: 9.99 }],
			db: "testdb",
		});

		expect(result.successCount).toBe(1);
		expect(result.failureCount).toBe(0);
	});

	it("uses ordered: false to continue on duplicate errors", async () => {
		mockCollection.insertMany.mockResolvedValue({ insertedCount: 2 });

		await bulkInsertRecords({
			tableName: "users",
			records: [{ name: "A" }, { name: "B" }],
			db: "testdb",
		});

		expect(mockCollection.insertMany).toHaveBeenCalledWith(
			expect.any(Array),
			{ ordered: false },
		);
	});

	it("removes empty _id from records before inserting", async () => {
		mockCollection.insertMany.mockResolvedValue({ insertedCount: 1 });

		await bulkInsertRecords({
			tableName: "users",
			records: [{ _id: "", name: "Bob" }],
			db: "testdb",
		});

		const insertedDocs = mockCollection.insertMany.mock.calls[0][0] as Record<string, unknown>[];
		expect(insertedDocs[0]).not.toHaveProperty("_id");
		expect(insertedDocs[0].name).toBe("Bob");
	});

	it("removes null _id from records before inserting", async () => {
		mockCollection.insertMany.mockResolvedValue({ insertedCount: 1 });

		await bulkInsertRecords({
			tableName: "users",
			records: [{ _id: null, name: "Carol" }],
			db: "testdb",
		});

		const insertedDocs = mockCollection.insertMany.mock.calls[0][0] as Record<string, unknown>[];
		expect(insertedDocs[0]).not.toHaveProperty("_id");
	});

	it("preserves explicit non-empty _id in records", async () => {
		mockCollection.insertMany.mockResolvedValue({ insertedCount: 1 });

		await bulkInsertRecords({
			tableName: "configs",
			records: [{ _id: "custom-id", key: "theme" }],
			db: "testdb",
		});

		const insertedDocs = mockCollection.insertMany.mock.calls[0][0] as Record<string, unknown>[];
		expect(insertedDocs[0]._id).toBe("custom-id");
	});

	it("handles large batches correctly", async () => {
		mockCollection.insertMany.mockResolvedValue({ insertedCount: 500 });

		const records = Array.from({ length: 500 }, (_, i) => ({
			name: `User ${i}`,
			index: i,
		}));

		const result = await bulkInsertRecords({
			tableName: "users",
			records,
			db: "testdb",
		});

		expect(result.successCount).toBe(500);
		expect(result.failureCount).toBe(0);
	});

	it("throws HTTPException 400 when records array is empty", async () => {
		await expect(
			bulkInsertRecords({ tableName: "users", records: [], db: "testdb" }),
		).rejects.toMatchObject({ status: 400 });

		expect(mockCollection.insertMany).not.toHaveBeenCalled();
	});

	it("throws HTTPException 500 when insertMany throws", async () => {
		mockCollection.insertMany.mockRejectedValue(
			new Error("BulkWriteError: duplicate key"),
		);

		await expect(
			bulkInsertRecords({
				tableName: "users",
				records: [{ _id: "dup", name: "Dup" }],
				db: "testdb",
			}),
		).rejects.toMatchObject({ status: 500 });
	});

	it("calculates failureCount as records.length minus insertedCount", async () => {
		mockCollection.insertMany.mockResolvedValue({ insertedCount: 8 });

		const result = await bulkInsertRecords({
			tableName: "users",
			records: Array.from({ length: 10 }, (_, i) => ({ name: `U${i}` })),
			db: "testdb",
		});

		expect(result.failureCount).toBe(2);
	});

	it("uses singular 'record' in message for single insert", async () => {
		mockCollection.insertMany.mockResolvedValue({ insertedCount: 1 });

		const result = await bulkInsertRecords({
			tableName: "users",
			records: [{ name: "Solo" }],
			db: "testdb",
		});

		expect(result.message).toContain("1 record");
		expect(result.message).not.toContain("records");
	});

	it("uses plural 'records' in message for multiple inserts", async () => {
		mockCollection.insertMany.mockResolvedValue({ insertedCount: 5 });

		const result = await bulkInsertRecords({
			tableName: "users",
			records: Array.from({ length: 5 }, (_, i) => ({ name: `U${i}` })),
			db: "testdb",
		});

		expect(result.message).toContain("records");
	});

	it("calls getMongoDb with the correct database name", async () => {
		mockCollection.insertMany.mockResolvedValue({ insertedCount: 1 });

		await bulkInsertRecords({
			tableName: "users",
			records: [{ name: "Alice" }],
			db: "production",
		});

		const { getMongoDb } = await import("@/db-manager.js");
		expect(getMongoDb).toHaveBeenCalledWith("production");
	});
});
