import type { Column, DatabaseSchema, DatabaseSchemaType, Table } from "shared/types";
import { getMongoDb } from "@/mongo-manager.js";
import { getMongoTableColumns, normalizeMongoDocument } from "./tables.dao.js";

const convertColumn = (col: {
	columnName: string;
	dataTypeLabel: string;
	isNullable: boolean;
	isPrimaryKey: boolean;
}): Column => ({
	name: col.columnName,
	type: col.dataTypeLabel,
	nullable: col.isNullable,
	isPrimaryKey: col.isPrimaryKey,
});

export async function getMongoDatabaseSchema(
	db: DatabaseSchemaType["db"],
	options: {
		includeSampleData?: boolean;
		maxTables?: number;
	} = {},
): Promise<DatabaseSchema> {
	const { includeSampleData = false, maxTables } = options;
	const mongoDb = await getMongoDb(db);
	const collections = await mongoDb.listCollections().toArray();
	const limitedCollections =
		typeof maxTables === "number" && maxTables > 0
			? collections.slice(0, maxTables)
			: collections;

	const tablePromises = limitedCollections.map(async (collection) => {
		const name = collection.name;
		const columns = await getMongoTableColumns({ tableName: name, db });
		const table: Table = {
			name,
			columns: columns.map(convertColumn),
		};

		if (includeSampleData) {
			const rows = await mongoDb.collection(name).find({}).limit(3).toArray();
			const normalized = rows.map((row) => normalizeMongoDocument(row) as Record<string, unknown>);
			table.sampleData = normalized.map((row) =>
				Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value)])),
			);
		}

		return table;
	});

	const tables = await Promise.all(tablePromises);

	return {
		dbType: "mongodb",
		tables,
		relationships: [],
	};
}
