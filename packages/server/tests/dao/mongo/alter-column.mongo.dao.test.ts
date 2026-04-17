import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HTTPException } from "hono/http-exception";

let mockCollection: ReturnType<typeof makeMockCollection>;

const makeMockCollection = () => ({
	findOne: vi.fn(),
	updateMany: vi.fn(),
});

const mockDb = {
	collection: vi.fn(() => mockCollection),
	listCollections: vi.fn(),
	command: vi.fn(),
};

vi.mock("@/db-manager.js", () => ({
	getMongoDb: vi.fn(() => Promise.resolve(mockDb)),
}));

import {
	mongoRenameColumn,
	mongoAlterColumn,
} from "@/dao/mongo/alter-column.mongo.dao.js";

describe("MongoDB Alter Column DAO", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockCollection = makeMockCollection();
		mockDb.collection.mockReturnValue(mockCollection);
		// By default the collection exists
		mockDb.listCollections.mockReturnValue({
			toArray: vi.fn().mockResolvedValue([{ name: "users", options: {} }]),
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ============================================
	// mongoRenameColumn
	// ============================================
	describe("mongoRenameColumn", () => {
		it("renames a field across all documents", async () => {
			mockCollection.findOne
				.mockResolvedValueOnce({ username: "alice" }) // field exists
				.mockResolvedValueOnce(null); // target doesn't exist
			mockCollection.updateMany.mockResolvedValue({ modifiedCount: 5 });

			await mongoRenameColumn({
				tableName: "users",
				columnName: "username",
				newColumnName: "handle",
				db: "testdb",
			});

			expect(mockCollection.updateMany).toHaveBeenCalledWith(
				{ username: { $exists: true } },
				{ $rename: { username: "handle" } },
			);
		});

		it("throws 404 when collection does not exist", async () => {
			mockDb.listCollections.mockReturnValue({
				toArray: vi.fn().mockResolvedValue([]),
			});

			await expect(
				mongoRenameColumn({
					tableName: "ghost",
					columnName: "field",
					newColumnName: "newField",
					db: "testdb",
				}),
			).rejects.toMatchObject({ status: 404 });
		});

		it("throws 400 when trying to rename _id field", async () => {
			await expect(
				mongoRenameColumn({
					tableName: "users",
					columnName: "_id",
					newColumnName: "id",
					db: "testdb",
				}),
			).rejects.toMatchObject({ status: 400 });
		});

		it("throws 404 when source field does not exist in any document", async () => {
			mockCollection.findOne
				.mockResolvedValueOnce(null); // field doesn't exist

			await expect(
				mongoRenameColumn({
					tableName: "users",
					columnName: "nonexistent",
					newColumnName: "newField",
					db: "testdb",
				}),
			).rejects.toMatchObject({ status: 404 });
		});

		it("throws 409 when target field already exists", async () => {
			mockCollection.findOne
				.mockResolvedValueOnce({ username: "alice" }) // source field exists
				.mockResolvedValueOnce({ handle: "alice_handle" }); // target exists

			await expect(
				mongoRenameColumn({
					tableName: "users",
					columnName: "username",
					newColumnName: "handle",
					db: "testdb",
				}),
			).rejects.toMatchObject({ status: 409 });
		});

		it("does not call updateMany when collection does not exist", async () => {
			mockDb.listCollections.mockReturnValue({
				toArray: vi.fn().mockResolvedValue([]),
			});

			await expect(
				mongoRenameColumn({
					tableName: "ghost",
					columnName: "field",
					newColumnName: "newField",
					db: "testdb",
				}),
			).rejects.toThrow();

			expect(mockCollection.updateMany).not.toHaveBeenCalled();
		});
	});

	// ============================================
	// mongoAlterColumn
	// ============================================
	describe("mongoAlterColumn", () => {
		it("updates the field bsonType in the collection validator", async () => {
			mockDb.command.mockResolvedValue({ ok: 1 });

			await mongoAlterColumn({
				tableName: "users",
				columnName: "age",
				columnType: "long",
				isNullable: false,
				db: "testdb",
			});

			const commandArg = mockDb.command.mock.calls[0][0] as {
				collMod: string;
				validator: { $jsonSchema: { properties: Record<string, unknown> } };
			};
			expect(commandArg.collMod).toBe("users");
			expect(commandArg.validator.$jsonSchema.properties.age).toMatchObject({
				bsonType: "long",
			});
		});

		it("sets nullable bsonType as array with null when isNullable true", async () => {
			mockDb.command.mockResolvedValue({ ok: 1 });

			await mongoAlterColumn({
				tableName: "users",
				columnName: "bio",
				columnType: "string",
				isNullable: true,
				db: "testdb",
			});

			const commandArg = mockDb.command.mock.calls[0][0] as {
				validator: { $jsonSchema: { properties: Record<string, unknown> } };
			};
			expect(commandArg.validator.$jsonSchema.properties.bio).toMatchObject({
				bsonType: ["string", "null"],
			});
		});

		it("adds field to required list when non-nullable and not already there", async () => {
			mockDb.listCollections.mockReturnValue({
				toArray: vi.fn().mockResolvedValue([
					{ name: "users", options: { validator: { $jsonSchema: { required: ["name"] } } } },
				]),
			});
			mockDb.command.mockResolvedValue({ ok: 1 });

			await mongoAlterColumn({
				tableName: "users",
				columnName: "email",
				columnType: "string",
				isNullable: false,
				db: "testdb",
			});

			const commandArg = mockDb.command.mock.calls[0][0] as {
				validator: { $jsonSchema: { required: string[] } };
			};
			expect(commandArg.validator.$jsonSchema.required).toContain("email");
			expect(commandArg.validator.$jsonSchema.required).toContain("name");
		});

		it("removes field from required list when changed to nullable", async () => {
			mockDb.listCollections.mockReturnValue({
				toArray: vi.fn().mockResolvedValue([
					{
						name: "users",
						options: {
							validator: {
								$jsonSchema: {
									required: ["name", "email"],
									properties: { name: { bsonType: "string" }, email: { bsonType: "string" } },
								},
							},
						},
					},
				]),
			});
			mockDb.command.mockResolvedValue({ ok: 1 });

			await mongoAlterColumn({
				tableName: "users",
				columnName: "email",
				columnType: "string",
				isNullable: true,
				db: "testdb",
			});

			const commandArg = mockDb.command.mock.calls[0][0] as {
				validator: { $jsonSchema: { required: string[] } };
			};
			expect(commandArg.validator.$jsonSchema.required).not.toContain("email");
			expect(commandArg.validator.$jsonSchema.required).toContain("name");
		});

		it("throws 404 when collection does not exist", async () => {
			mockDb.listCollections.mockReturnValue({
				toArray: vi.fn().mockResolvedValue([]),
			});

			await expect(
				mongoAlterColumn({
					tableName: "ghost",
					columnName: "field",
					columnType: "string",
					isNullable: true,
					db: "testdb",
				}),
			).rejects.toMatchObject({ status: 404 });
		});

		it("throws 400 when trying to alter _id field", async () => {
			await expect(
				mongoAlterColumn({
					tableName: "users",
					columnName: "_id",
					columnType: "string",
					isNullable: false,
					db: "testdb",
				}),
			).rejects.toMatchObject({ status: 400 });
		});

		it("preserves existing properties when updating a specific field", async () => {
			mockDb.listCollections.mockReturnValue({
				toArray: vi.fn().mockResolvedValue([
					{
						name: "users",
						options: {
							validator: {
								$jsonSchema: {
									properties: {
										name: { bsonType: "string" },
										age: { bsonType: "int" },
									},
									required: ["name"],
								},
							},
						},
					},
				]),
			});
			mockDb.command.mockResolvedValue({ ok: 1 });

			await mongoAlterColumn({
				tableName: "users",
				columnName: "age",
				columnType: "long",
				isNullable: false,
				db: "testdb",
			});

			const commandArg = mockDb.command.mock.calls[0][0] as {
				validator: { $jsonSchema: { properties: Record<string, unknown>; required: string[] } };
			};
			expect(commandArg.validator.$jsonSchema.properties).toHaveProperty("name");
			expect(commandArg.validator.$jsonSchema.properties).toHaveProperty("age");
		});
	});
});
