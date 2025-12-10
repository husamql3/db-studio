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
				// You can specify a different primary key if needed
				// primaryKey: "id", // defaults to 'id' on the backend
			};

			console.log("Sending update payload:", payload);

			const response = await fetch("http://localhost:3000/records", {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});

			const result = await response.json();

			if (!response.ok || !result.success) {
				// Throw an error with the message from the API
				throw new Error(result.message || result.detail || "Failed to update records");
			}

			return result;
		},
		onSuccess: async (result) => {
			const count = getUpdateCount();
			toast.success(
				result.message ||
					`${count} ${count === 1 ? "change" : "changes"} saved successfully`,
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
