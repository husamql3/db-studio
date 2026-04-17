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

import { addMongoField } from "@/dao/mongo/add-column.mongo.dao.js";

describe("addMongoField", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockCollection = makeMockCollection();
		mockDb.collection.mockReturnValue(mockCollection);
		// By default collection exists
		mockDb.listCollections.mockReturnValue({ toArray: vi.fn().mockResolvedValue([{ name: "users", options: {} }]) });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("adds a new string field with default empty string", async () => {
		mockCollection.findOne.mockResolvedValue(null);
		mockCollection.updateMany.mockResolvedValue({ modifiedCount: 5 });
		mockDb.command.mockResolvedValue({ ok: 1 });

		await addMongoField({
			tableName: "users",
			columnName: "nickname",
			columnType: "string",
			isNullable: true,
			defaultValue: null,
			db: "testdb",
		});

		expect(mockCollection.updateMany).toHaveBeenCalledWith(
			{},
			{ $set: { nickname: "" } },
		);
		expect(mockDb.command).toHaveBeenCalledTimes(1);
	});

	it("adds a numeric field with default 0", async () => {
		mockCollection.findOne.mockResolvedValue(null);
		mockCollection.updateMany.mockResolvedValue({ modifiedCount: 10 });
		mockDb.command.mockResolvedValue({ ok: 1 });

		await addMongoField({
			tableName: "products",
			columnName: "stock",
			columnType: "int",
			isNullable: false,
			defaultValue: null,
			db: "testdb",
		});

		expect(mockCollection.updateMany).toHaveBeenCalledWith(
			{},
			{ $set: { stock: 0 } },
		);
	});

	it("adds a boolean field with default false", async () => {
		mockCollection.findOne.mockResolvedValue(null);
		mockCollection.updateMany.mockResolvedValue({ modifiedCount: 3 });
		mockDb.command.mockResolvedValue({ ok: 1 });

		await addMongoField({
			tableName: "users",
			columnName: "active",
			columnType: "bool",
			isNullable: false,
			defaultValue: null,
			db: "testdb",
		});

		expect(mockCollection.updateMany).toHaveBeenCalledWith(
			{},
			{ $set: { active: false } },
		);
	});

	it("adds an array field with default empty array", async () => {
		mockCollection.findOne.mockResolvedValue(null);
		mockCollection.updateMany.mockResolvedValue({ modifiedCount: 2 });
		mockDb.command.mockResolvedValue({ ok: 1 });

		await addMongoField({
			tableName: "posts",
			columnName: "tags",
			columnType: "array",
			isNullable: true,
			defaultValue: null,
			db: "testdb",
		});

		expect(mockCollection.updateMany).toHaveBeenCalledWith(
			{},
			{ $set: { tags: [] } },
		);
	});

	it("adds an object field with default empty object", async () => {
		mockCollection.findOne.mockResolvedValue(null);
		mockCollection.updateMany.mockResolvedValue({ modifiedCount: 1 });
		mockDb.command.mockResolvedValue({ ok: 1 });

		await addMongoField({
			tableName: "users",
			columnName: "metadata",
			columnType: "object",
			isNullable: true,
			defaultValue: null,
			db: "testdb",
		});

		const updateCall = mockCollection.updateMany.mock.calls[0][1] as Record<string, unknown>;
		expect(updateCall).toMatchObject({ $set: { metadata: {} } });
	});

	it("uses provided default value when specified", async () => {
		mockCollection.findOne.mockResolvedValue(null);
		mockCollection.updateMany.mockResolvedValue({ modifiedCount: 5 });
		mockDb.command.mockResolvedValue({ ok: 1 });

		await addMongoField({
			tableName: "products",
			columnName: "rating",
			columnType: "double",
			isNullable: true,
			defaultValue: "4.5",
			db: "testdb",
		});

		expect(mockCollection.updateMany).toHaveBeenCalledWith(
			{},
			{ $set: { rating: 4.5 } },
		);
	});

	it("uses string default value as-is when not parseable as JSON", async () => {
		mockCollection.findOne.mockResolvedValue(null);
		mockCollection.updateMany.mockResolvedValue({ modifiedCount: 1 });
		mockDb.command.mockResolvedValue({ ok: 1 });

		await addMongoField({
			tableName: "users",
			columnName: "status",
			columnType: "string",
			isNullable: true,
			defaultValue: "pending",
			db: "testdb",
		});

		expect(mockCollection.updateMany).toHaveBeenCalledWith(
			{},
			{ $set: { status: "pending" } },
		);
	});

	it("updates validator to mark required for non-nullable field", async () => {
		mockCollection.findOne.mockResolvedValue(null);
		mockCollection.updateMany.mockResolvedValue({ modifiedCount: 1 });
		mockDb.command.mockResolvedValue({ ok: 1 });

		await addMongoField({
			tableName: "users",
			columnName: "email",
			columnType: "string",
			isNullable: false,
			defaultValue: null,
			db: "testdb",
		});

		const commandArg = mockDb.command.mock.calls[0][0] as {
			validator: { $jsonSchema: { required: string[]; properties: Record<string, unknown> } };
		};
		expect(commandArg.validator.$jsonSchema.required).toContain("email");
		expect(commandArg.validator.$jsonSchema.properties.email).toMatchObject({
			bsonType: "string",
		});
	});

	it("does not add required for nullable field", async () => {
		mockCollection.findOne.mockResolvedValue(null);
		mockCollection.updateMany.mockResolvedValue({ modifiedCount: 1 });
		mockDb.command.mockResolvedValue({ ok: 1 });

		await addMongoField({
			tableName: "users",
			columnName: "bio",
			columnType: "string",
			isNullable: true,
			defaultValue: null,
			db: "testdb",
		});

		const commandArg = mockDb.command.mock.calls[0][0] as {
			validator: { $jsonSchema: { required?: string[]; properties: Record<string, unknown> } };
		};
		expect(commandArg.validator.$jsonSchema.required ?? []).not.toContain("bio");
		expect(commandArg.validator.$jsonSchema.properties.bio).toMatchObject({
			bsonType: ["string", "null"],
		});
	});

	it("throws HTTPException 404 when collection does not exist", async () => {
		mockDb.listCollections.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) });

		await expect(
			addMongoField({
				tableName: "ghost",
				columnName: "field",
				columnType: "string",
				isNullable: true,
				defaultValue: null,
				db: "testdb",
			}),
		).rejects.toMatchObject({ status: 404 });
	});

	it("throws HTTPException 409 when field already exists", async () => {
		mockCollection.findOne.mockResolvedValue({ nickname: "existing" });

		await expect(
			addMongoField({
				tableName: "users",
				columnName: "nickname",
				columnType: "string",
				isNullable: true,
				defaultValue: null,
				db: "testdb",
			}),
		).rejects.toMatchObject({ status: 409 });
	});

	it("preserves existing validator schema properties", async () => {
		mockDb.listCollections.mockReturnValue({
			toArray: vi.fn().mockResolvedValue([
				{
					name: "users",
					options: {
						validator: {
							$jsonSchema: {
								bsonType: "object",
								properties: { name: { bsonType: "string" } },
								required: ["name"],
							},
						},
					},
				},
			]),
		});
		mockCollection.findOne.mockResolvedValue(null);
		mockCollection.updateMany.mockResolvedValue({ modifiedCount: 1 });
		mockDb.command.mockResolvedValue({ ok: 1 });

		await addMongoField({
			tableName: "users",
			columnName: "age",
			columnType: "int",
			isNullable: false,
			defaultValue: null,
			db: "testdb",
		});

		const commandArg = mockDb.command.mock.calls[0][0] as {
			validator: { $jsonSchema: { required: string[]; properties: Record<string, unknown> } };
		};
		expect(commandArg.validator.$jsonSchema.properties).toHaveProperty("name");
		expect(commandArg.validator.$jsonSchema.properties).toHaveProperty("age");
		expect(commandArg.validator.$jsonSchema.required).toContain("name");
		expect(commandArg.validator.$jsonSchema.required).toContain("age");
	});
});
