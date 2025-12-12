import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queries } from "@/providers/queries";
import { useActiveTableStore } from "@/stores/active-table.store";
import { CACHE_KEYS } from "@/utils/constants/constans";

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

export const useDeleteCells = () => {
	const queryClient = useQueryClient();
	const { activeTable, clearRowSelection } = useActiveTableStore();

	// Get table columns to find primary key
	const { data: tableCols } = useQuery(queries.tableCols(activeTable ?? ""));

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
		}): Promise<DeleteResult> => {
			if (!activeTable) {
				throw new Error("No active table selected");
			}

			if (!tableCols || tableCols.length === 0) {
				throw new Error("No table columns found");
			}

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
				tableName: activeTable,
				primaryKeys,
			};

			console.log("Delete payload:", payload);

			const endpoint = force
				? "http://localhost:3000/records/force"
				: "http://localhost:3000/records";

			const response = await fetch(endpoint, {
				method: "DELETE",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});

			const result: DeleteResult = await response.json();

			// For FK violations (409), we don't throw - we return the result with relatedRecords
			if (result.fkViolation) {
				return result;
			}

			if (!response.ok || !result.success) {
				throw new Error(result.message || "Failed to delete records");
			}

			return result;
		},
		onSuccess: async (result) => {
			// Only show success toast and clear selection if actually deleted
			if (result.success) {
				toast.success(result.message || "Records deleted successfully");
				clearRowSelection();

				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: [CACHE_KEYS.TABLE_DATA, activeTable],
						exact: false,
					}),
					queryClient.invalidateQueries({
						queryKey: [CACHE_KEYS.TABLES_LIST],
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
