import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BaseResponse } from "shared/types";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Route } from "@/routes/_pathlessLayout/table/$table";
import { useDatabaseStore } from "@/stores/database.store";
import { type CellUpdate, useUpdateCellStore } from "@/stores/update-cell.store";
import { CONSTANTS } from "@/utils/constants";

export const useUpdateCell = () => {
	const queryClient = useQueryClient();
	const { table } = Route.useParams();
	const { clearUpdates, getUpdateCount } = useUpdateCellStore();
	const { selectedDatabase } = useDatabaseStore();

	const { mutateAsync: updateCellMutation, isPending: isUpdatingCell } = useMutation({
		mutationFn: async (updates: CellUpdate[]) => {
			if (!table) {
				throw new Error("No table selected");
			}

			// Transform updates into the format the API expects
			const payload = {
				tableName: table,
				updates: updates.map((update) => ({
					rowData: update.rowData,
					columnName: update.columnName,
					value: update.newValue,
				})),
			};

			const params = new URLSearchParams({ db: selectedDatabase ?? "" });
			return api.patch<BaseResponse<string>>("/records", payload, { params });
		},
		onSuccess: async (res) => {
			const count = getUpdateCount();
			toast.success(
				res.data.data || `${count} ${count === 1 ? "change" : "changes"} saved successfully`,
			);
			clearUpdates();

			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: [CONSTANTS.CACHE_KEYS.TABLE_DATA, table],
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
