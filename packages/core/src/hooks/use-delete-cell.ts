import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnInfo } from "server/src/dao/table-columns.dao";
import { toast } from "sonner";
import { useDatabaseStore } from "@/stores/database.store";
import { API_URL, CONSTANTS } from "@/utils/constants";
import { useTableCols } from "./use-table-cols";

export interface RelatedRecord {
	tableName: string;
	columnName: string;
	constraintName: string;
	records: Array<Record<string, unknown>>;
}

export interface DeleteResult {
	success: boolean;
	message: string;
	deletedCount?: number;
	fkViolation?: boolean;
	relatedRecords?: RelatedRecord[];
}

export const useDeleteCells = ({ tableName }: { tableName: string }) => {
	const queryClient = useQueryClient();
	// const [activeTable] = useQueryState(CONSTANTS.ACTIVE_TABLE);
	const { tableCols } = useTableCols({ tableName });
	const { selectedDatabase } = useDatabaseStore();

	const {
		mutateAsync: deleteCellsAsync,
		isPending: isDeletingCells,
		reset: resetDeleteResult,
	} = useMutation({
		mutationFn: async ({
			rowData,
			force = false,
		}: {
			rowData: Record<string, unknown>[];
			force?: boolean;
		}) => {
			if (!tableName) {
				throw new Error("No active table selected");
			}

			if (!tableCols || tableCols.length === 0) {
				throw new Error("No table columns found");
			}

			const result = await deleteCellsService(
				tableName,
				tableCols,
				rowData,
				force,
				selectedDatabase || undefined,
			);
			return result;
		},
		onSuccess: async (result) => {
			// Only show success toast and clear selection if actually deleted
			if (result.success) {
				toast.success(result.message || "Records deleted successfully");
				// clearRowSelection();

				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: [CONSTANTS.CACHE_KEYS.TABLE_DATA, tableName],
						exact: false,
					}),
					queryClient.invalidateQueries({
						queryKey: [CONSTANTS.CACHE_KEYS.TABLES_LIST],
					}),
				]);
			}
		},
		onError: (error) => {
			console.error("Delete error:", error);
			toast.error("Failed to delete records", {
				description: error instanceof Error ? error.message : "Unknown error occurred",
			});
		},
	});

	const deleteCells = async (
		rowData: Record<string, unknown>[],
	): Promise<DeleteResult> => {
		return deleteCellsAsync({ rowData, force: false });
	};

	const forceDeleteCells = async (
		rowData: Record<string, unknown>[],
	): Promise<DeleteResult> => {
		return deleteCellsAsync({ rowData, force: true });
	};

	return {
		deleteCells,
		forceDeleteCells,
		isDeletingCells,
		resetDeleteResult,
	};
};

export const deleteCellsService = async (
	tableName: string,
	tableCols: ColumnInfo[],
	rowData: Record<string, unknown>[],
	force: boolean,
	database?: string,
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

	const url = new URL(`${API_URL}${endpoint}`);
	if (database) {
		url.searchParams.set("database", database);
	}

	const res = await fetch(url.toString(), {
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
