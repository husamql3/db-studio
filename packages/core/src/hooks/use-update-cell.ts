import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { toast } from "sonner";
import { fetcher } from "@/lib/fetcher";
import { useDatabaseStore } from "@/stores/database.store";
import { type CellUpdate, useUpdateCellStore } from "@/stores/update-cell.store";
import { CONSTANTS } from "@/utils/constants";

export const useUpdateCell = () => {
	const queryClient = useQueryClient();
	const [activeTable] = useQueryState(CONSTANTS.ACTIVE_TABLE);
	const { clearUpdates, getUpdateCount } = useUpdateCellStore();
	const { selectedDatabase } = useDatabaseStore();

	const { mutateAsync: updateCellMutation, isPending: isUpdatingCell } = useMutation({
		mutationFn: async (updates: CellUpdate[]) => {
			if (!activeTable) {
				throw new Error("No active table selected");
			}

			// Transform updates into the format the API expects
			const payload = {
				tableName: activeTable,
				updates: updates.map((update) => ({
					rowData: update.rowData,
					columnName: update.columnName,
					value: update.newValue,
				})),
			};

			return fetcher.patch<{ message?: string }>("/records", payload, {
				params: { database: selectedDatabase },
			});
		},
		onSuccess: async (result) => {
			const count = getUpdateCount();
			toast.success(
				result.message || `${count} ${count === 1 ? "change" : "changes"} saved successfully`,
			);
			clearUpdates();

			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: [CONSTANTS.CACHE_KEYS.TABLE_DATA, activeTable],
					exact: false,
				}),
			]);
		},
		onError: (error) => {
			console.error("Update error:", error);
			toast.error("Failed to save changes", {
				description: error instanceof Error ? error.message : "Unknown error occurred",
			});
		},
	});

	return {
		updateCell: updateCellMutation,
		isUpdatingCell: isUpdatingCell,
	};
};
