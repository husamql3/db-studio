import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useActiveTableStore } from "@/stores/active-table.store";
import { type CellUpdate, useUpdateCellStore } from "@/stores/update-cell.store";
import { CACHE_KEYS } from "@/utils/constants/constans";

export const useUpdateCell = () => {
	const queryClient = useQueryClient();
	const { activeTable } = useActiveTableStore();
	const { clearUpdates, getUpdateCount } = useUpdateCellStore();

	const { mutateAsync: updateCellMutation, isPending: isUpdatingCell } = useMutation({
		mutationFn: async (updates: CellUpdate[]) => {
			// Transform updates into the format your API expects
			const payload = updates.map((update) => ({
				rowData: update.rowData,
				columnName: update.columnName,
				value: update.newValue,
			}));

			await new Promise((resolve) => setTimeout(resolve, 3000));

			console.log("payload", payload);
			return { success: true, message: "Changes saved successfully" };
		},
		onSuccess: async () => {
			toast.success(
				`${getUpdateCount()} ${getUpdateCount() === 1 ? "change" : "changes"} saved successfully`,
			);
			clearUpdates();

			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: [CACHE_KEYS.TABLE_DATA, activeTable],
					exact: false,
				}),
			]);
		},
		onError: (error) => {
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
