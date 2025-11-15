import type { DataType } from "@/types/table-grid.type";

export interface ColumnInfo {
	columnName: string;
	dataType: DataType;
	dataTypeLabel: string;
	isNullable: boolean;
	columnDefault: string | null;
	isPrimaryKey: boolean;
}

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
