import { HTTPException } from "hono/http-exception";
import type { AddColumnParamsSchemaType } from "shared/types";
import { getMongoDb } from "@/db-manager.js";

/**
 * Adds a field to all documents in a MongoDB collection.
 * Sets a typed default value and updates the collection's JSON Schema validator.
 */
export async function addColumn({
	tableName,
	columnName,
	columnType,
	defaultValue,
	isNullable,
	db,
}: AddColumnParamsSchemaType): Promise<void> {
	const mongoDb = await getMongoDb(db);
	const collections = await mongoDb.listCollections({ name: tableName }).toArray();
	if (collections.length === 0) {
		throw new HTTPException(404, { message: `Collection "${tableName}" does not exist` });
	}

	// Check field doesn't already exist
	const conflict = await mongoDb
		.collection(tableName)
		.findOne({ [columnName]: { $exists: true } });
	if (conflict) {
		throw new HTTPException(409, {
			message: `Field "${columnName}" already exists in collection "${tableName}"`,
		});
	}

	// Resolve a typed default value
	const resolvedDefault = resolveDefault(defaultValue, columnType);

	// Set the field on all existing documents
	await mongoDb
		.collection(tableName)
		.updateMany({}, { $set: { [columnName]: resolvedDefault } });

	// Update the JSON Schema validator
	const collInfo = collections[0] as {
		options?: {
			validator?: {
				$jsonSchema?: { properties?: Record<string, unknown>; required?: string[] };
			};
		};
	};
	const existingSchema = collInfo.options?.validator?.$jsonSchema ?? {};
	const properties: Record<string, unknown> = {
		...((existingSchema.properties as Record<string, unknown>) ?? {}),
		[columnName]: { bsonType: isNullable ? [columnType, "null"] : columnType },
	};
	const required: string[] = [...(existingSchema.required ?? [])];
	if (!isNullable && !required.includes(columnName)) {
		required.push(columnName);
	}

	await mongoDb.command({
		collMod: tableName,
		validator: {
			$jsonSchema: {
				...existingSchema,
				bsonType: "object",
				properties,
				...(required.length > 0 ? { required } : {}),
			},
		},
		validationAction: "warn",
	});
}

export { addColumn as addMongoField };

const resolveDefault = (
	defaultValue: string | null | undefined,
	columnType: string,
): unknown => {
	if (defaultValue !== undefined && defaultValue !== null && defaultValue.trim() !== "") {
		try {
			return JSON.parse(defaultValue);
		} catch {
			return defaultValue;
		}
	}
	switch (columnType) {
		case "string":
			return "";
		case "int":
		case "long":
		case "double":
		case "decimal":
			return 0;
		case "bool":
			return false;
		case "array":
			return [];
		case "object":
			return {};
		case "date":
			return new Date();
		default:
			return null;
	}
};
