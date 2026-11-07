/**
 * Field changes of the MongoDB adapter against a real server: what each one leaves in the
 * collection's `$jsonSchema` validator.
 *
 * Failure modes it covers:
 * - the edit-column form sends back the type label `getTableColumns` gave a field (`numeric`,
 *   `text`, `json`, `timestamptz`, `boolean`) and the validator rejects it as no BSON type;
 * - a type that is no BSON type reaches the server instead of answering 400;
 * - changing a field downgrades the collection's validationAction from "error" to "warn";
 * - dropping or renaming a required field of a collection db-studio created is refused by its
 *   own validator, or leaves the old name in the validator's properties and required list;
 * - dropping a field of a collection that does not exist answers anything but 404;
 * - creating a collection whose fields are all nullable sends an empty `required`, which the
 *   server refuses.
 *
 * It uses a scratch database of the MongoDB at MONGO_TEST_URL (default mongodb://127.0.0.1:27017,
 * the `bun run init-db:mongo` container) and drops it after each test. When no MongoDB answers
 * there, the suite is skipped.
 */
import { type CollectionInfo, MongoClient } from "mongodb";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoAdapter } from "@/adapters/mongo/mongo.adapter.js";
import {
	closeAllConnections,
	createConnection,
	registerConnection,
} from "@/open-connections.js";

const MONGO_URL = process.env.MONGO_TEST_URL ?? "mongodb://127.0.0.1:27017";
const DB = "dbstudio_live_test";
const COLLECTION = "people";

const raw = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 1000 });

const available = await raw.connect().then(
	() => true,
	() => false,
);

const collectionOptions = async () => {
	const [info] = await raw
		.db(DB)
		.listCollections<CollectionInfo>({ name: COLLECTION })
		.toArray();

	return {
		validator: info?.options?.validator,
		validationAction: info?.options?.validationAction,
	};
};

describe.skipIf(!available)("MongoAdapter field changes against a real MongoDB", () => {
	const adapter = new MongoAdapter();

	beforeAll(() => {
		registerConnection("mongo-live-test", createConnection(`${MONGO_URL}/${DB}`));
	});

	afterAll(async () => {
		await raw.close();
		await closeAllConnections();
	});

	beforeEach(async () => {
		await adapter.createTable({
			db: DB,
			tableData: {
				tableName: COLLECTION,
				fields: [
					{ columnName: "name", columnType: "string" },
					{ columnName: "age", columnType: "int" },
					{ columnName: "profile", columnType: "object" },
					{ columnName: "born", columnType: "date" },
					{ columnName: "active", columnType: "bool" },
				].map((field) => ({
					...field,
					isPrimaryKey: false,
					isNullable: false,
					isUnique: false,
					isIdentity: false,
					isArray: false,
				})),
			},
		});
		await raw
			.db(DB)
			.collection(COLLECTION)
			.insertOne({
				name: "Ada",
				age: 36,
				profile: { city: "London" },
				born: new Date("1815-12-10T00:00:00Z"),
				active: true,
			});
	});

	afterEach(async () => {
		await raw.db(DB).dropDatabase();
	});

	it("takes back each type label getTableColumns gives a field", async () => {
		const columns = await adapter.getTableColumns({ db: DB, tableName: COLLECTION });
		const label = (name: string) => columns.find((c) => c.columnName === name)?.dataTypeLabel;

		expect(columns.map((c) => [c.columnName, c.dataTypeLabel])).toEqual([
			["_id", "text"],
			["name", "text"],
			["age", "numeric"],
			["profile", "json"],
			["born", "timestamptz"],
			["active", "boolean"],
		]);

		for (const columnName of ["name", "age", "profile", "born", "active"]) {
			await adapter.alterColumn({
				db: DB,
				tableName: COLLECTION,
				columnName,
				columnType: label(columnName) ?? "",
				isNullable: false,
			});
		}

		const { validator, validationAction } = await collectionOptions();

		expect(validator.$jsonSchema.properties).toEqual({
			name: { bsonType: "string" },
			age: { bsonType: "number" },
			profile: { bsonType: "object" },
			born: { bsonType: "date" },
			active: { bsonType: "bool" },
		});
		expect(validationAction).toBe("error");
		// "number" accepts every numeric BSON type, so a double still passes the validator.
		await expect(
			raw
				.db(DB)
				.collection(COLLECTION)
				.updateOne({}, { $set: { age: 36.5 } }),
		).resolves.toMatchObject({ modifiedCount: 1 });
		await expect(
			raw
				.db(DB)
				.collection(COLLECTION)
				.updateOne({}, { $set: { age: "old" } }),
		).rejects.toMatchObject({ code: 121 });
	});

	it("answers 400 for a type that is no BSON type", async () => {
		await expect(
			adapter.alterColumn({
				db: DB,
				tableName: COLLECTION,
				columnName: "age",
				columnType: "integer",
				isNullable: false,
			}),
		).rejects.toMatchObject({ status: 400 });
		await expect(
			adapter.addColumn({
				db: DB,
				tableName: COLLECTION,
				columnName: "score",
				columnType: "varchar",
				isPrimaryKey: false,
				isNullable: true,
				isUnique: false,
				isIdentity: false,
				isArray: false,
			}),
		).rejects.toMatchObject({ status: 400 });
		expect(
			await raw
				.db(DB)
				.collection(COLLECTION)
				.findOne({}, { projection: { _id: 0 } }),
		).not.toHaveProperty("score");
	});

	it("drops a required field from the documents and the validator", async () => {
		await adapter.deleteColumn({ db: DB, tableName: COLLECTION, columnName: "age" });

		const { validator, validationAction } = await collectionOptions();

		expect(Object.keys(validator.$jsonSchema.properties)).toEqual([
			"name",
			"profile",
			"born",
			"active",
		]);
		expect(validator.$jsonSchema.required).toEqual(["name", "profile", "born", "active"]);
		expect(validationAction).toBe("error");
		expect(await raw.db(DB).collection(COLLECTION).findOne({})).not.toHaveProperty("age");
	});

	it("renames a required field in the documents and the validator", async () => {
		await adapter.renameColumn({
			db: DB,
			tableName: COLLECTION,
			columnName: "age",
			newColumnName: "years",
		});

		const { validator, validationAction } = await collectionOptions();

		expect(validator.$jsonSchema.properties).not.toHaveProperty("age");
		expect(validator.$jsonSchema.properties.years).toEqual({ bsonType: "int" });
		expect(validator.$jsonSchema.required).toContain("years");
		expect(validator.$jsonSchema.required).not.toContain("age");
		expect(validationAction).toBe("error");
		expect(await raw.db(DB).collection(COLLECTION).findOne({})).toMatchObject({ years: 36 });
	});

	it("answers 404 when dropping a field of a missing collection", async () => {
		await expect(
			adapter.deleteColumn({ db: DB, tableName: "missing", columnName: "age" }),
		).rejects.toMatchObject({ status: 404 });
	});

	it("creates a collection whose fields are all nullable", async () => {
		await adapter.createTable({
			db: DB,
			tableData: {
				tableName: "optional",
				fields: [
					{
						columnName: "note",
						columnType: "string",
						isPrimaryKey: false,
						isNullable: true,
						isUnique: false,
						isIdentity: false,
						isArray: false,
					},
				],
			},
		});

		const [info] = await raw
			.db(DB)
			.listCollections<CollectionInfo>({ name: "optional" })
			.toArray();

		expect(info?.options?.validator).toEqual({
			$jsonSchema: {
				bsonType: "object",
				properties: { note: { bsonType: "string" } },
				additionalProperties: true,
			},
		});
	});
});
