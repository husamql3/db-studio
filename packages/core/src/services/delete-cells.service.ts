import type { DeleteResult } from "@/hooks/use-delete-cells";
import { API_URL } from "@/utils/constants/constans";
import type { ColumnInfo } from "./get-table-cols.service";

export const deleteCellsService = async (
	tableName: string,
	tableCols: ColumnInfo[],
	rowData: Record<string, unknown>[],
	force: boolean,
): Promise<DeleteResult> => {
	const endpoint = force ? "/records/force" : "/records";

	// Find primary key column
	const primaryKeyCol = tableCols.find((col) => col.isPrimaryKey);
	if (!primaryKeyCol) {
		throw new Error("No primary key found for this table");
	}

	// Extract primary key values from each row
	const primaryKeys = rowData.map((row) => ({
		columnName: primaryKeyCol.columnName,
		value: row[primaryKeyCol.columnName],
	}));

	const payload = {
		tableName,
		primaryKeys,
	};

	const res = await fetch(`${API_URL}${endpoint}`, {
		method: "DELETE",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload),
	});

	const result: DeleteResult = await res.json();

	// For FK violations (409), we don't throw - we return the result with relatedRecords
	if (result.fkViolation) {
		return result;
	}

	if (!res.ok || !result.success) {
		throw new Error(result.message || "Failed to delete records");
	}

	return result;
};
