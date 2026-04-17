import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HTTPException } from "hono/http-exception";

// Build a chainable cursor mock factory
const createCursor = (data: unknown[] = []) => ({
	sort: vi.fn().mockReturnThis(),
	skip: vi.fn().mockReturnThis(),
	limit: vi.fn().mockReturnThis(),
	toArray: vi.fn().mockResolvedValue(data),
});

const createAggregateCursor = (data: unknown[] = []) => ({
	toArray: vi.fn().mockResolvedValue(data),
});

// Mutable collection mock
let mockCollection: ReturnType<typeof makeMockCollection>;

const makeMockCollection = () => ({
	find: vi.fn(() => createCursor()),
	aggregate: vi.fn(() => createAggregateCursor()),
	insertOne: vi.fn(),
	insertMany: vi.fn(),
	updateOne: vi.fn(),
	updateMany: vi.fn(),
	deleteOne: vi.fn(),
	deleteMany: vi.fn(),
	countDocuments: vi.fn().mockResolvedValue(0),
});

const mockDb = {
	collection: vi.fn(() => mockCollection),
};

vi.mock("@/db-manager.js", () => ({
	getMongoDb: vi.fn(() => Promise.resolve(mockDb)),
	isValidObjectId: vi.fn((v: unknown) => typeof v === "string" && /^[0-9a-f]{24}$/i.test(v)),
	coerceObjectId: vi.fn((v: unknown) => ({ toHexString: () => v, _bsontype: "ObjectId" })),
}));

import { executeMongoQuery } from "@/dao/mongo/query.dao.js";

describe("executeMongoQuery", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockCollection = makeMockCollection();
		mockDb.collection.mockReturnValue(mockCollection);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ============================================
	// Input validation
	// ============================================
	describe("input validation", () => {
		it("throws 400 when query is empty string", async () => {
			await expect(
				executeMongoQuery({ query: "", db: "testdb" }),
			).rejects.toMatchObject({ status: 400 });
		});

		it("throws 400 when query is whitespace only", async () => {
			await expect(
				executeMongoQuery({ query: "   ", db: "testdb" }),
			).rejects.toMatchObject({ status: 400 });
		});

		it("throws 400 when query is not valid JSON", async () => {
			await expect(
				executeMongoQuery({ query: "not json at all", db: "testdb" }),
			).rejects.toMatchObject({ status: 400 });
		});

		it("throws 400 when collection is missing", async () => {
			const query = JSON.stringify({ operation: "find" });
			await expect(
				executeMongoQuery({ query, db: "testdb" }),
			).rejects.toMatchObject({ status: 400 });
		});

		it("throws 400 when operation is missing", async () => {
			const query = JSON.stringify({ collection: "users" });
			await expect(
				executeMongoQuery({ query, db: "testdb" }),
			).rejects.toMatchObject({ status: 400 });
		});
	});

	// ============================================
	// find operation
	// ============================================
	describe("find operation", () => {
		it("returns documents with normalized columns", async () => {
			const docs = [
				{ _id: { _bsontype: "ObjectId", toHexString: () => "507f1f77bcf86cd799439011" }, name: "Alice", age: 30 },
				{ _id: { _bsontype: "ObjectId", toHexString: () => "507f1f77bcf86cd799439012" }, name: "Bob", age: 25 },
			];
			mockCollection.find.mockReturnValue(createCursor(docs));

			const result = await executeMongoQuery({
				query: JSON.stringify({ collection: "users", operation: "find" }),
				db: "testdb",
			});

			expect(result.rowCount).toBe(2);
			expect(result.columns).toContain("name");
			expect(result.columns).toContain("age");
		});

		it("returns empty result for find with no documents", async () => {
			mockCollection.find.mockReturnValue(createCursor([]));

			const result = await executeMongoQuery({
				query: JSON.stringify({ collection: "users", operation: "find", filter: { active: false } }),
				db: "testdb",
			});

			expect(result.rowCount).toBe(0);
			expect(result.rows).toEqual([]);
			expect(result.columns).toEqual([]);
		});

		it("passes filter to collection.find", async () => {
			mockCollection.find.mockReturnValue(createCursor([{ name: "Alice", age: 30 }]));

			await executeMongoQuery({
				query: JSON.stringify({
					collection: "users",
					operation: "find",
					filter: { age: { $gt: 25 } },
				}),
				db: "testdb",
			});

			expect(mockCollection.find).toHaveBeenCalledWith(
				expect.objectContaining({ age: { $gt: 25 } }),
				expect.anything(),
			);
		});

		it("applies skip and limit when provided", async () => {
			const cursor = createCursor([]);
			mockCollection.find.mockReturnValue(cursor);

			await executeMongoQuery({
				query: JSON.stringify({
					collection: "users",
					operation: "find",
					skip: 10,
					limit: 5,
				}),
				db: "testdb",
			});

			expect(cursor.skip).toHaveBeenCalledWith(10);
			expect(cursor.limit).toHaveBeenCalledWith(5);
		});

		it("normalizes ObjectId _id strings in filter", async () => {
			mockCollection.find.mockReturnValue(createCursor([]));

			await executeMongoQuery({
				query: JSON.stringify({
					collection: "users",
					operation: "find",
					filter: { _id: "507f1f77bcf86cd799439011" },
				}),
				db: "testdb",
			});

			// coerceObjectId should have been called for the valid 24-char hex string
			const { coerceObjectId } = await import("@/db-manager.js");
			expect(coerceObjectId).toHaveBeenCalledWith("507f1f77bcf86cd799439011");
		});

		it("normalizes $in ObjectId arrays in filter", async () => {
			mockCollection.find.mockReturnValue(createCursor([]));

			await executeMongoQuery({
				query: JSON.stringify({
					collection: "users",
					operation: "find",
					filter: {
						_id: { $in: ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"] },
					},
				}),
				db: "testdb",
			});

			const { coerceObjectId } = await import("@/db-manager.js");
			expect(coerceObjectId).toHaveBeenCalledTimes(2);
		});

		it("includes duration in the result", async () => {
			mockCollection.find.mockReturnValue(createCursor([]));

			const result = await executeMongoQuery({
				query: JSON.stringify({ collection: "users", operation: "find" }),
				db: "testdb",
			});

			expect(typeof result.duration).toBe("number");
			expect(result.duration).toBeGreaterThanOrEqual(0);
		});
	});

	// ============================================
	// aggregate operation
	// ============================================
	describe("aggregate operation", () => {
		it("returns aggregated results", async () => {
			const aggDocs = [
				{ _id: "NYC", count: 342 },
				{ _id: "LA", count: 198 },
			];
			mockCollection.aggregate.mockReturnValue(createAggregateCursor(aggDocs));

			const result = await executeMongoQuery({
				query: JSON.stringify({
					collection: "orders",
					operation: "aggregate",
					pipeline: [
						{ $group: { _id: "$city", count: { $sum: 1 } } },
						{ $sort: { count: -1 } },
					],
				}),
				db: "testdb",
			});

			expect(result.rowCount).toBe(2);
			expect(result.columns).toEqual(expect.arrayContaining(["_id", "count"]));
		});

		it("uses empty pipeline when none provided", async () => {
			mockCollection.aggregate.mockReturnValue(createAggregateCursor([]));

			await executeMongoQuery({
				query: JSON.stringify({ collection: "users", operation: "aggregate" }),
				db: "testdb",
			});

			expect(mockCollection.aggregate).toHaveBeenCalledWith([], expect.anything());
		});
	});

	// ============================================
	// insertOne operation
	// ============================================
	describe("insertOne operation", () => {
		it("inserts one document and returns rowCount 1", async () => {
			mockCollection.insertOne.mockResolvedValue({ insertedId: "newId" });

			const result = await executeMongoQuery({
				query: JSON.stringify({
					collection: "users",
					operation: "insertOne",
					document: { name: "Charlie", email: "charlie@test.com" },
				}),
				db: "testdb",
			});

			expect(result.rowCount).toBe(1);
			expect(result.message).toBe("OK");
		});

		it("throws 400 when document is missing", async () => {
			await expect(
				executeMongoQuery({
					query: JSON.stringify({ collection: "users", operation: "insertOne" }),
					db: "testdb",
				}),
			).rejects.toMatchObject({ status: 400 });
		});
	});

	// ============================================
	// insertMany operation
	// ============================================
	describe("insertMany operation", () => {
		it("inserts multiple documents and returns rowCount", async () => {
			mockCollection.insertMany.mockResolvedValue({ insertedCount: 3 });

			const result = await executeMongoQuery({
				query: JSON.stringify({
					collection: "products",
					operation: "insertMany",
					document: [{ name: "A" }, { name: "B" }, { name: "C" }],
				}),
				db: "testdb",
			});

			expect(result.rowCount).toBe(3);
			expect(result.message).toBe("OK");
		});

		it("throws 400 when document is not an array", async () => {
			await expect(
				executeMongoQuery({
					query: JSON.stringify({
						collection: "users",
						operation: "insertMany",
						document: { name: "Single" },
					}),
					db: "testdb",
				}),
			).rejects.toMatchObject({ status: 400 });
		});
	});

	// ============================================
	// updateOne operation
	// ============================================
	describe("updateOne operation", () => {
		it("updates one document and returns matchedCount", async () => {
			mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

			const result = await executeMongoQuery({
				query: JSON.stringify({
					collection: "users",
					operation: "updateOne",
					filter: { _id: "507f1f77bcf86cd799439011" },
					update: { $set: { age: 31 } },
				}),
				db: "testdb",
			});

			expect(result.rowCount).toBe(1);
			expect(result.message).toBe("OK (1 modified)");
		});

		it("throws 400 when update is missing", async () => {
			await expect(
				executeMongoQuery({
					query: JSON.stringify({
						collection: "users",
						operation: "updateOne",
						filter: { name: "Alice" },
					}),
					db: "testdb",
				}),
			).rejects.toMatchObject({ status: 400 });
		});
	});

	// ============================================
	// updateMany operation
	// ============================================
	describe("updateMany operation", () => {
		it("updates many documents and reports modified count in message", async () => {
			mockCollection.updateMany.mockResolvedValue({ matchedCount: 5, modifiedCount: 5 });

			const result = await executeMongoQuery({
				query: JSON.stringify({
					collection: "users",
					operation: "updateMany",
					filter: { active: false },
					update: { $set: { status: "inactive" } },
				}),
				db: "testdb",
			});

			expect(result.rowCount).toBe(5);
			expect(result.message).toBe("OK (5 modified)");
		});
	});

	// ============================================
	// deleteOne operation
	// ============================================
	describe("deleteOne operation", () => {
		it("deletes one document and returns deletedCount", async () => {
			mockCollection.deleteOne.mockResolvedValue({ deletedCount: 1 });

			const result = await executeMongoQuery({
				query: JSON.stringify({
					collection: "users",
					operation: "deleteOne",
					filter: { _id: "507f1f77bcf86cd799439011" },
				}),
				db: "testdb",
			});

			expect(result.rowCount).toBe(1);
			expect(result.message).toBe("OK");
		});

		it("returns deletedCount 0 when no document matched", async () => {
			mockCollection.deleteOne.mockResolvedValue({ deletedCount: 0 });

			const result = await executeMongoQuery({
				query: JSON.stringify({
					collection: "users",
					operation: "deleteOne",
					filter: { _id: "507f1f77bcf86cd799439099" },
				}),
				db: "testdb",
			});

			expect(result.rowCount).toBe(0);
		});
	});

	// ============================================
	// deleteMany operation
	// ============================================
	describe("deleteMany operation", () => {
		it("deletes multiple documents and returns deletedCount", async () => {
			mockCollection.deleteMany.mockResolvedValue({ deletedCount: 10 });

			const result = await executeMongoQuery({
				query: JSON.stringify({
					collection: "sessions",
					operation: "deleteMany",
					filter: { expired: true },
				}),
				db: "testdb",
			});

			expect(result.rowCount).toBe(10);
			expect(result.message).toBe("OK");
		});
	});

	// ============================================
	// count operation
	// ============================================
	describe("count operation", () => {
		it("counts documents and returns count row", async () => {
			mockCollection.countDocuments.mockResolvedValue(1542);

			const result = await executeMongoQuery({
				query: JSON.stringify({
					collection: "users",
					operation: "count",
					filter: { active: true },
				}),
				db: "testdb",
			});

			expect(result.rowCount).toBe(1542);
			expect(result.rows).toEqual([{ count: 1542 }]);
			expect(result.columns).toEqual(["count"]);
			expect(result.message).toBe("OK");
		});

		it("returns 0 count for empty collection", async () => {
			mockCollection.countDocuments.mockResolvedValue(0);

			const result = await executeMongoQuery({
				query: JSON.stringify({ collection: "empty", operation: "count" }),
				db: "testdb",
			});

			expect(result.rowCount).toBe(0);
			expect(result.rows[0]).toEqual({ count: 0 });
		});
	});

	// ============================================
	// unsupported operation
	// ============================================
	describe("unsupported operation", () => {
		it("throws 400 for unknown operation type", async () => {
			await expect(
				executeMongoQuery({
					query: JSON.stringify({ collection: "users", operation: "drop" }),
					db: "testdb",
				}),
			).rejects.toMatchObject({ status: 400 });
		});
	});
});
