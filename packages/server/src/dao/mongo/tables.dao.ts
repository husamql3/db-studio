export { deleteColumn as deleteMongoColumn } from "./delete-column.mongo.dao.js";
export { exportTableData as exportMongoTableData } from "./export-table.mongo.dao.js";
export {
	buildMongoFilters,
	buildMongoSort as buildMongoSortForQuery,
	canCoerceObjectId,
	normalizeMongoDocument,
	toMongoId,
} from "./mongo.utils.js";
export { getTableColumns as getMongoTableColumns } from "./table-columns.mongo.dao.js";
export { getTablesList as getMongoTablesList } from "./table-list.mongo.dao.js";
export { getTableData as getMongoTableData } from "./tables-data.mongo.dao.js";

import type { CreateTableSchemaType, DatabaseSchemaType } from "@db-studio/shared/types";
import { createTable } from "./create-table.mongo.dao.js";

export async function createMongoCollection({
	tableName,
	tableData,
	db,
}: {
	tableName: string;
	tableData?: CreateTableSchemaType;
	db: DatabaseSchemaType["db"];
}): Promise<void> {
	await createTable({
		tableData: tableData ?? { tableName, fields: [] },
		db,
	});
}
