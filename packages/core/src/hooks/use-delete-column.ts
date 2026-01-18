import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DeleteColumnParams, DeleteColumnResponse } from "shared/types";
import { toast } from "sonner";
import { fetcher } from "@/lib/fetcher";
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
		mutationFn: ({ tableName, columnName, cascade }: DeleteColumnParams) =>
			fetcher.delete<DeleteColumnResponse>(
				`/tables/${tableName}/columns/${columnName}`,
				undefined,
				{
					params: {
						database: selectedDatabase,
						cascade: cascade ? "true" : undefined,
					},
				},
			),
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
