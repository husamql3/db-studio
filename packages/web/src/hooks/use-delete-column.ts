import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DeleteColumnParamsSchemaType } from "shared/types";
import { toast } from "sonner";
import { deleteColumn as deleteColumnRequest } from "@/shared/api";
import { tableKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";

export const useDeleteColumn = () => {
	const queryClient = useQueryClient();
	const { selectedDatabase } = useDatabaseStore();

	const { mutateAsync: deleteColumnAsync, isPending: isDeletingColumn } = useMutation<
		string,
		Error,
		DeleteColumnParamsSchemaType
	>({
		mutationFn: async ({ tableName, columnName, cascade }: DeleteColumnParamsSchemaType) => {
			const res = await deleteColumnRequest({
				tableName,
				columnName,
				cascade,
				db: selectedDatabase ?? "",
			});
			return res.data.data;
		},
		onSuccess: async (_, variables) => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: tableKeys.columnsByTable(variables.tableName),
					exact: false,
				}),
				queryClient.invalidateQueries({
					queryKey: tableKeys.dataByTable(variables.tableName),
					exact: false,
				}),
				queryClient.invalidateQueries({
					queryKey: tableKeys.lists(),
					exact: false,
				}),
			]);
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
		isDeletingColumn,
	};
};
