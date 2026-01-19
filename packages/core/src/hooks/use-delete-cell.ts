import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnInfo } from "shared/types";
import { toast } from "sonner";
import { useTableCols } from "@/hooks/use-table-cols";
import { FetcherError, fetcher } from "@/lib/fetcher";
import { useDatabaseStore } from "@/stores/database.store";
import { CONSTANTS } from "@/utils/constants";

export interface RelatedRecord {
	tableName: string;
	columnName: string;
	constraintName: string;
	records: Array<Record<string, unknown>>;
}

interface DeleteResult {
	success: boolean;
	message: string;
	deletedCount?: number;
	fkViolation?: boolean;
	relatedRecords?: RelatedRecord[];
}

export const useDeleteCells = ({ tableName }: { tableName: string }) => {
	const queryClient = useQueryClient();
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
				description:
					error instanceof Error ? error.message : "Unknown error occurred",
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

const deleteCellsService = async (
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

	try {
		return await fetcher.delete<DeleteResult>(endpoint, payload, {
			params: { database },
		});
	} catch (error) {
		// For FK violations (409), we return the result with relatedRecords instead of throwing
		if (error instanceof FetcherError && error.status === 409) {
			const result = error.data as DeleteResult;
			if (result.fkViolation) {
				return result;
			}
		}
		throw error;
	}
};
