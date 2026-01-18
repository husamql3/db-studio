import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DEFAULTS } from "shared/constants";
import type { DeleteColumnParams, DeleteColumnResponse } from "shared/types";
import { toast } from "sonner";
import { useDatabaseStore } from "@/stores/database.store";
import { CONSTANTS } from "@/utils/constants";
export const useDeleteColumn = () => {
	const queryClient = useQueryClient();
	const { selectedDatabase } = useDatabaseStore();

	const { mutateAsync: deleteColumnAsync } = useMutation<
		DeleteColumnResponse,
		Error,
		DeleteColumnParams
	>({
		mutationFn: async ({
			tableName,
			columnName,
			cascade,
		}: DeleteColumnParams) => {
			try {
				const url = new URL(
					`${DEFAULTS.BASE_URL}/tables/${tableName}/columns/${columnName}`,
				);

				// if selectedDatabase is not null, set the database query parameter
				selectedDatabase && url.searchParams.set("database", selectedDatabase);

				// if cascade is true, add cascade query parameter
				cascade && url.searchParams.set("cascade", "true");

				const res = await fetch(url.toString(), {
					method: "DELETE",
					headers: {
						"Content-Type": "application/json",
					},
				});

				if (!res.ok) {
					const errorData = await res.json();
					throw new Error(errorData.message || "Failed to delete column");
				}

				return res.json() as Promise<DeleteColumnResponse>;
			} catch (error) {
				throw new Error(
					error instanceof Error ? error.message : "Failed to delete column",
				);
			}
		},
		onSuccess: async (data) => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: [CONSTANTS.CACHE_KEYS.TABLE_COLUMNS, data.tableName],
					exact: false,
				}),
				queryClient.invalidateQueries({
					queryKey: [CONSTANTS.CACHE_KEYS.TABLE_DATA, data.tableName],
					exact: false,
				}),
				queryClient.invalidateQueries({
					queryKey: [CONSTANTS.CACHE_KEYS.TABLES_LIST],
					exact: false,
				}),
			]);
		},
		onError: (error) => {
			console.error("Error deleting column:", error);
		},
	});

	const deleteColumn = async ({
		tableName,
		columnName,
		cascade,
	}: DeleteColumnParams) => {
		return toast.promise(
			deleteColumnAsync({ tableName, columnName, cascade }),
			{
				loading: "Deleting column...",
				success: (result) => result.message || "Column deleted successfully",
				error: (error: Error) => error.message || "Failed to delete column",
			},
		);
	};

	return {
		deleteColumn,
	};
};
