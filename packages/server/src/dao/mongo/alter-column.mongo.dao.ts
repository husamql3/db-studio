import { HTTPException } from "hono/http-exception";
import type { AlterColumnParamsSchemaType, RenameColumnParamsSchemaType } from "shared/types";
import { getMongoDb } from "@/db-manager.js";

/**
 * Renames a field across all documents in a collection using $rename.
 */
export async function renameColumn({
	tableName,
	columnName,
	newColumnName,
	db,
}: RenameColumnParamsSchemaType): Promise<void> {
	const mongoDb = await getMongoDb(db);
	const collections = await mongoDb.listCollections({ name: tableName }).toArray();
	if (collections.length === 0) {
		throw new HTTPException(404, { message: `Collection "${tableName}" does not exist` });
	}

	if (columnName === "_id") {
		throw new HTTPException(400, { message: 'Cannot rename the "_id" field' });
	}

	// Check if the field exists in at least one document
	const sample = await mongoDb
		.collection(tableName)
		.findOne({ [columnName]: { $exists: true } });
	if (!sample) {
		throw new HTTPException(404, {
			message: `Field "${columnName}" does not exist in collection "${tableName}"`,
		});
	}

	// Check target field doesn't already exist
	const conflict = await mongoDb
		.collection(tableName)
		.findOne({ [newColumnName]: { $exists: true } });
	if (conflict) {
		throw new HTTPException(409, {
			message: `Field "${newColumnName}" already exists in collection "${tableName}"`,
		});
	}

	await mongoDb
		.collection(tableName)
		.updateMany(
			{ [columnName]: { $exists: true } },
			{ $rename: { [columnName]: newColumnName } },
		);
}

/**
 * Alters a field across all documents in a collection.
 * MongoDB is schemaless so this updates the collection's JSON Schema validator
 * and optionally converts existing field values to the new type.
 */
export async function alterColumn({
	tableName,
	columnName,
	columnType,
	isNullable,
	db,
}: AlterColumnParamsSchemaType): Promise<void> {
	const mongoDb = await getMongoDb(db);
	const collections = await mongoDb.listCollections({ name: tableName }).toArray();
	if (collections.length === 0) {
		throw new HTTPException(404, { message: `Collection "${tableName}" does not exist` });
	}

	if (columnName === "_id") {
		throw new HTTPException(400, { message: 'Cannot alter the "_id" field' });
	}

	// Fetch existing validator if any
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
	};
	const required: string[] = [...(existingSchema.required ?? [])];

	// Update the field's bsonType in the validator
	const bsonType = isNullable ? [columnType, "null"] : columnType;
	properties[columnName] = { bsonType };

	// Update required list
	const reqIndex = required.indexOf(columnName);
	if (!isNullable && reqIndex === -1) {
		required.push(columnName);
	} else if (isNullable && reqIndex !== -1) {
		required.splice(reqIndex, 1);
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

export { alterColumn as mongoAlterColumn, renameColumn as mongoRenameColumn };
