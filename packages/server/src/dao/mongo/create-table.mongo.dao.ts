import { HTTPException } from "hono/http-exception";
import type { CreateTableSchemaType, DatabaseSchemaType } from "shared/types";
import { getMongoDb } from "@/adapters/connections.js";

const MONGO_BSON_TYPES = new Set([
	"double",
	"string",
	"object",
	"array",
	"binData",
	"undefined",
	"objectId",
	"bool",
	"date",
	"null",
	"regex",
	"dbPointer",
	"javascript",
	"symbol",
	"javascriptWithScope",
	"int",
	"timestamp",
	"long",
	"decimal",
	"minKey",
	"maxKey",
]);

const mapMongoBsonType = (rawType: string): string => {
	const normalized = rawType.trim();
	if (MONGO_BSON_TYPES.has(normalized)) return normalized;

	switch (normalized.toLowerCase()) {
		case "boolean":
			return "bool";
		case "objectid":
			return "objectId";
		case "binary":
			return "binData";
		default:
			return normalized;
	}
};

export async function createTable({
	tableData,
	db,
}: {
	tableData: CreateTableSchemaType;
	db: DatabaseSchemaType["db"];
}): Promise<void> {
	const tableName = tableData?.tableName ?? "";
	const mongoDb = await getMongoDb(db);
	const collections = await mongoDb.listCollections({ name: tableName }).toArray();
	if (collections.length > 0) {
		throw new HTTPException(400, { message: `Collection "${tableName}" already exists` });
	}

	const fields = tableData?.fields ?? [];
	if (fields.length === 0) {
		await mongoDb.createCollection(tableName);
		return;
	}

	const properties: Record<string, unknown> = {};
	const required: string[] = [];

	for (const field of fields) {
		const bsonType = mapMongoBsonType(field.columnType);
		if (!MONGO_BSON_TYPES.has(bsonType)) {
			throw new HTTPException(400, {
				message: `Unsupported MongoDB BSON type "${field.columnType}" for field "${field.columnName}"`,
			});
		}

		if (field.isArray) {
			properties[field.columnName] = {
				bsonType: "array",
				...(bsonType !== "array" ? { items: { bsonType } } : {}),
			};
		} else {
			properties[field.columnName] = { bsonType };
		}

		if (!field.isNullable) {
			required.push(field.columnName);
		}
	}

	await mongoDb.createCollection(tableName, {
		validator: {
			$jsonSchema: {
				bsonType: "object",
				required,
				properties,
				additionalProperties: true,
			},
		},
		validationAction: "error",
	});
}
