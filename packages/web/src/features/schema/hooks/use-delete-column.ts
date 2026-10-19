import type { DeleteColumnParamsSchemaType } from "@db-studio/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
		mutationFn: async ({
			tableName,
			schemaName,
			columnName,
			cascade,
		}: DeleteColumnParamsSchemaType) => {
			const res = await deleteColumnRequest({
				tableName,
				schemaName,
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
		schemaName,
		columnName,
		cascade,
	}: Omit<DeleteColumnParamsSchemaType, "schemaName"> & {
		schemaName: string | undefined;
	}) => {
		return toast.promise(
			deleteColumnAsync({ tableName, schemaName, columnName, cascade, db: "" }),
			{
				loading: "Deleting column...",
				success: (message) => message || "Column deleted successfully",
				error: (error: Error) => error.message || "Failed to delete column",
			},
		);
	};

	return {
		deleteColumn,
		isDeletingColumn,
	};
};
