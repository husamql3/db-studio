import { HTTPException } from "hono/http-exception";
import type { DatabaseSchemaType, TableNameSchemaType } from "shared/types";
import { getMongoDb } from "@/db-manager.js";

const SAMPLE_LIMIT = 200;

const inferBsonType = (value: unknown): string => {
	if (value === null || value === undefined) return "null";
	if (value instanceof Date) return "date";
	if (typeof value === "boolean") return "bool";
	if (typeof value === "number") return Number.isInteger(value) ? "int" : "double";
	if (typeof value === "bigint") return "long";
	if (Array.isArray(value)) return "array";
	if (typeof value === "object") {
		if ("_bsontype" in (value as object)) {
			const bson = (value as { _bsontype: string })._bsontype;
			if (bson === "ObjectId") return "objectId";
			if (bson === "Decimal128") return "decimal";
			if (bson === "Binary") return "binData";
			if (bson === "Timestamp") return "timestamp";
			return bson.toLowerCase();
		}
		return "object";
	}
	return "string";
};

export async function getTableSchema({
	tableName,
	db,
}: {
	tableName: TableNameSchemaType["tableName"];
	db: DatabaseSchemaType["db"];
}): Promise<string> {
	const mongoDb = await getMongoDb(db);
	const collections = await mongoDb.listCollections({ name: tableName }).toArray();
	if (collections.length === 0) {
		throw new HTTPException(404, { message: `Collection "${tableName}" does not exist` });
	}

	const collection = mongoDb.collection(tableName);
	const docs = await collection.find({}).limit(SAMPLE_LIMIT).toArray();
	const totalDocs = await collection.estimatedDocumentCount();

	// Build field → bson types map
	const fieldTypes = new Map<string, Set<string>>();
	const fieldPresence = new Map<string, number>();

	for (const doc of docs) {
		for (const [key, value] of Object.entries(doc)) {
			const bsonType = inferBsonType(value);
			if (!fieldTypes.has(key)) {
				fieldTypes.set(key, new Set());
				fieldPresence.set(key, 0);
			}
			fieldTypes.get(key)?.add(bsonType);
			fieldPresence.set(key, (fieldPresence.get(key) ?? 0) + 1);
		}
	}

	const properties: Record<string, unknown> = {};
	const required: string[] = [];

	for (const [field, types] of fieldTypes.entries()) {
		const presence = fieldPresence.get(field) ?? 0;
		const isRequired = presence === docs.length && docs.length > 0;
		const typeList = Array.from(types).filter((t) => t !== "null");
		const isNullable = types.has("null") || presence < docs.length;

		if (isRequired && !isNullable) required.push(field);

		properties[field] =
			typeList.length === 1
				? { bsonType: isNullable ? [typeList[0], "null"] : typeList[0] }
				: { bsonType: isNullable ? [...typeList, "null"] : typeList };
	}

	const schema = {
		collection: tableName,
		estimatedDocumentCount: totalDocs,
		sampledDocuments: docs.length,
		jsonSchema: {
			bsonType: "object",
			required: required.length > 0 ? required : undefined,
			properties,
		},
	};

	return JSON.stringify(schema, null, 2);
}
