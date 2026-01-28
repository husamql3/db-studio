import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BaseResponse, DeleteColumnParamsSchemaType } from "shared/types";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useDatabaseStore } from "@/stores/database.store";
import { CONSTANTS } from "@/utils/constants";

export const useDeleteColumn = () => {
	const queryClient = useQueryClient();
	const { selectedDatabase } = useDatabaseStore();

	const { mutateAsync: deleteColumnAsync } = useMutation<
		string,
		Error,
		DeleteColumnParamsSchemaType
	>({
		mutationFn: async ({ tableName, columnName, cascade }: DeleteColumnParamsSchemaType) => {
			const params = new URLSearchParams({
				db: selectedDatabase ?? "",
				cascade: cascade ? "true" : "false",
			});
			const res = await api.delete<BaseResponse<string>>(
				`/tables/${encodeURIComponent(tableName)}/columns/${encodeURIComponent(columnName)}`,
				{ params },
			);
			return res.data.data;
		},
		onSuccess: async (_, variables) => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: [CONSTANTS.CACHE_KEYS.TABLE_COLUMNS, variables.tableName],
					exact: false,
				}),
				queryClient.invalidateQueries({
					queryKey: [CONSTANTS.CACHE_KEYS.TABLE_DATA, variables.tableName],
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
	}: DeleteColumnParamsSchemaType) => {
		return toast.promise(deleteColumnAsync({ tableName, columnName, cascade, db: "" }), {
			loading: "Deleting column...",
			success: (message) => message || "Column deleted successfully",
			error: (error: Error) => error.message || "Failed to delete column",
		});
	};

	return {
		deleteColumn,
	};
};
