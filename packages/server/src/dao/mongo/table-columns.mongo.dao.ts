import type { ColumnInfoSchemaType, DatabaseSchemaType, DataTypes } from "shared/types";
import { getMongoDb } from "@/adapters/connections.js";
import { inferDataType, mapDataTypeLabel } from "./mongo.utils.js";

const SAMPLE_LIMIT = 200;

export async function getTableColumns({
	tableName,
	db,
}: {
	tableName: string;
	db: DatabaseSchemaType["db"];
}): Promise<ColumnInfoSchemaType[]> {
	const mongoDb = await getMongoDb(db);
	const collection = mongoDb.collection(tableName);
	const documents = await collection.find({}).limit(SAMPLE_LIMIT).toArray();
	const totalDocs = documents.length;

	const columnMap = new Map<
		string,
		{
			types: Set<DataTypes>;
			nullable: boolean;
			presentCount: number;
		}
	>();

	const ensureColumn = (columnName: string, value: unknown) => {
		const dataType = inferDataType(value);
		if (!columnMap.has(columnName)) {
			columnMap.set(columnName, {
				types: new Set([dataType]),
				nullable: false,
				presentCount: 1,
			});
		} else {
			const entry = columnMap.get(columnName);
			if (entry) {
				entry.types.add(dataType);
				entry.presentCount += 1;
			}
		}
	};

	for (const doc of documents) {
		for (const [key, value] of Object.entries(doc)) {
			if (value === null || value === undefined) {
				if (!columnMap.has(key)) {
					columnMap.set(key, {
						types: new Set(["text"]),
						nullable: true,
						presentCount: 1,
					});
				} else {
					const entry = columnMap.get(key);
					if (entry) entry.nullable = true;
					if (entry) entry.presentCount += 1;
				}
				continue;
			}
			ensureColumn(key, value);
		}
	}

	if (totalDocs > 0) {
		for (const entry of columnMap.values()) {
			if (entry.presentCount < totalDocs) {
				entry.nullable = true;
			}
		}
	}

	if (!columnMap.has("_id")) {
		columnMap.set("_id", {
			types: new Set(["text"]),
			nullable: false,
			presentCount: totalDocs,
		});
	}

	return Array.from(columnMap.entries()).map(([columnName, meta]) => {
		const dataType = meta.types.values().next().value ?? "text";
		return {
			columnName,
			dataType,
			dataTypeLabel: mapDataTypeLabel(dataType) as ColumnInfoSchemaType["dataTypeLabel"],
			isNullable: meta.nullable,
			columnDefault: null,
			isPrimaryKey: columnName === "_id",
			isForeignKey: false,
			referencedTable: null,
			referencedColumn: null,
			enumValues: null,
		};
	});
}
