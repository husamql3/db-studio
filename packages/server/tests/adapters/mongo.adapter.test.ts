import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetMongoClient = vi.hoisted(() => vi.fn());
const mockGetMongoDb = vi.hoisted(() => vi.fn());
const mockGetMongoDbName = vi.hoisted(() => vi.fn(() => "appdb"));

vi.mock("@/adapters/connections.js", () => ({
	getMongoClient: mockGetMongoClient,
	getMongoDb: mockGetMongoDb,
	getMongoDbName: mockGetMongoDbName,
}));

vi.mock("@/db-manager.js", () => ({
	isValidObjectId: vi.fn(() => false),
	coerceObjectId: vi.fn((value: unknown) => value),
}));

import { MongoAdapter } from "@/adapters/mongo/mongo.adapter.js";

const docs = [
	{ _id: "1", name: "Ada", age: 36 },
	{ _id: "2", name: "Linus", age: 55 },
];

function cursor(data: Record<string, unknown>[] = docs) {
	const chain = {
		sort: vi.fn(),
		skip: vi.fn(),
		limit: vi.fn(),
		toArray: vi.fn(async () => data),
	};
	chain.sort.mockReturnValue(chain);
	chain.skip.mockReturnValue(chain);
	chain.limit.mockReturnValue(chain);
	return chain;
}

function createMongoMocks() {
	const collection = {
		countDocuments: vi.fn(async () => docs.length),
		estimatedDocumentCount: vi.fn(async () => docs.length),
		find: vi.fn(() => cursor()),
		aggregate: vi.fn(() => cursor([{ total: docs.length }])),
		findOne: vi.fn(async (filter: Record<string, unknown>) => {
			if ("name" in filter) return { name: "Ada" };
			return null;
		}),
		updateMany: vi.fn(async () => ({ matchedCount: 2, modifiedCount: 2 })),
		updateOne: vi.fn(async () => ({ matchedCount: 1, modifiedCount: 1 })),
		insertOne: vi.fn(async () => ({ insertedId: "inserted" as string | null })),
		insertMany: vi.fn(async (records: unknown[]) => ({ insertedCount: records.length })),
		deleteOne: vi.fn(async () => ({ deletedCount: 1 })),
		deleteMany: vi.fn(async () => ({ deletedCount: 1 })),
		drop: vi.fn(async () => true),
		rename: vi.fn(async () => ({})),
	};

	const mongoDb = {
		collection: vi.fn(() => collection),
		createCollection: vi.fn(async () => ({})),
		command: vi.fn(async () => ({ ok: 1 })),
		listCollections: vi.fn((filter?: { name?: string }) => ({
			toArray: vi.fn(async () => {
				if (filter?.name === "new_users" || filter?.name === "empty" || filter?.name === "other") return [];
				return [{ name: filter?.name ?? "users", options: { validator: { $jsonSchema: {} } } }];
			}),
		})),
	};

	const admin = {
		listDatabases: vi.fn(async () => ({
			databases: [{ name: "appdb", sizeOnDisk: 1024 }],
		})),
		serverStatus: vi.fn(async () => ({
			version: "7.0.0",
			connections: { current: 3, available: 97 },
		})),
	};
	const client = {
		db: vi.fn(() => ({
			admin: vi.fn(() => admin),
		})),
	};

	return { collection, mongoDb, admin, client };
}

describe("MongoAdapter integration scaffold", () => {
	let adapter: MongoAdapter;
	let mocks: ReturnType<typeof createMongoMocks>;

	beforeEach(() => {
		vi.clearAllMocks();
		adapter = new MongoAdapter();
		mocks = createMongoMocks();
		mockGetMongoDb.mockResolvedValue(mocks.mongoDb);
		mockGetMongoClient.mockResolvedValue(mocks.client);
		mockGetMongoDbName.mockReturnValue("appdb");
	});

	it("maps Mongo native types to and from the universal type set", () => {
		expect(adapter.mapToUniversalType("bool")).toBe("boolean");
		expect(adapter.mapToUniversalType("date")).toBe("date");
		expect(adapter.mapToUniversalType("array")).toBe("array");
		expect(adapter.mapToUniversalType("object")).toBe("json");
		expect(adapter.mapToUniversalType("unknown")).toBe("text");
		expect(adapter.mapFromUniversalType("number")).toBe("double");
		expect(adapter.mapFromUniversalType("boolean")).toBe("bool");
		expect(adapter.mapFromUniversalType("date")).toBe("date");
		expect(adapter.mapFromUniversalType("array")).toBe("array");
		expect(adapter.mapFromUniversalType("unknown")).toBe("string");
	});

	describe("getDatabasesList system filtering", () => {
		const systemRows = [
			{ name: "admin", sizeOnDisk: 40960 },
			{ name: "config", sizeOnDisk: 1024 },
			{ name: "myapp", sizeOnDisk: 1258291 },
			{ name: "local", sizeOnDisk: 512 },
		];

		it("filters admin/config/local when current is a user db", async () => {
			mockGetMongoDbName.mockReturnValue("myapp");
			mocks.admin.listDatabases.mockResolvedValue({ databases: systemRows });
			const result = await adapter.getDatabasesList();
			expect(result.map((d) => d.name)).toEqual(["myapp"]);
		});

		it("keeps the current db when it is a system db", async () => {
			mockGetMongoDbName.mockReturnValue("admin");
			mocks.admin.listDatabases.mockResolvedValue({ databases: systemRows });
			const result = await adapter.getDatabasesList();
			expect(result.map((d) => d.name)).toEqual(["admin", "myapp"]);
		});

		// Regression: Mongo omits databases that hold no data, so an empty connected
		// database is absent from listDatabases. A blanket "fall back to everything"
		// rule surfaced exactly the admin/config/local entries #277 asked us to hide.
		it("shows the connected db and still hides system dbs when the connected db is empty", async () => {
			mockGetMongoDbName.mockReturnValue("testdb");
			mocks.admin.listDatabases.mockResolvedValue({
				databases: [
					{ name: "admin", sizeOnDisk: 40960 },
					{ name: "local", sizeOnDisk: 1024 },
				],
			});
			const result = await adapter.getDatabasesList();
			expect(result.map((d) => d.name)).toEqual(["testdb"]);
		});
	});
});

describe("MongoAdapter.exportTableData", () => {
	let adapter: MongoAdapter;

	beforeEach(() => {
		vi.clearAllMocks();
		adapter = new MongoAdapter();
	});

	const mockCollectionWith = (docs: unknown[]) => {
		const collection = { find: vi.fn(() => ({ limit: vi.fn(() => ({ toArray: vi.fn(async () => docs) })) })) };
		mockGetMongoDb.mockResolvedValue({ collection: vi.fn(() => collection) });
	};

	it("keeps compound values nested so the JSON export stays structured", async () => {
		mockCollectionWith([
			{
				_id: "1",
				name: "Ada",
				age: 36,
				active: true,
				retired: null,
				profile: { role: "admin" },
				tags: ["a", "b"],
			},
		]);
		const { cols, rows } = await adapter.exportTableData({ tableName: "users", db: "appdb" });
		expect(cols).toEqual(
			expect.arrayContaining(["_id", "name", "age", "active", "retired", "profile", "tags"]),
		);
		expect(rows[0]).toEqual({
			_id: "1",
			name: "Ada",
			age: 36,
			active: true,
			retired: null,
			profile: { role: "admin" },
			tags: ["a", "b"],
		});
	});
});
