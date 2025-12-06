import type { ColumnInfo as ServerColumnInfo } from "../../server/src/dao/table-columns.dao";

export type ColumnInfo = ServerColumnInfo;

export const getTableCols = async (tableName: string | null): Promise<ColumnInfo[]> => {
	if (!tableName) {
		return [];
	}

	try {
		const response = await fetch(`/api/tables/${tableName}/columns`);
		if (!response.ok) {
			throw new Error("Failed to fetch table columns");
		}
		return response.json();
	} catch (error) {
		console.error("Error fetching table columns:", error);
		throw error;
	}
};
