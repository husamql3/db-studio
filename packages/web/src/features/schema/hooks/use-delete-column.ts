import type { DeleteColumnParamsSchemaType } from "@db-studio/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	deleteColumn as deleteColumnRequest,
	type ApiError,
	apiErrorMessage,
} from "@/shared/api";
import { invalidateTable } from "@/shared/query/invalidate-table";
import { useDatabaseStore } from "@/stores/database.store";

type DeleteColumnParams = Omit<DeleteColumnParamsSchemaType, "db" | "schemaName"> & {
	schemaName: string | undefined;
};

export const useDeleteColumn = () => {
	const queryClient = useQueryClient();
	const { selectedDatabase } = useDatabaseStore();

	const { mutateAsync: deleteColumnAsync, isPending: isDeletingColumn } = useMutation<
		string,
		ApiError,
		DeleteColumnParams
	>({
		mutationFn: async (params) => {
			const res = await deleteColumnRequest({ ...params, db: selectedDatabase ?? "" });

			return res.data.data;
		},
		onSuccess: async (_, variables) => {
			await invalidateTable(queryClient, variables.tableName);
		},
	});

	const deleteColumn = (params: DeleteColumnParams) =>
		toast.promise(deleteColumnAsync(params), {
			loading: "Deleting column...",
			success: (message) => message || "Column deleted successfully",
			error: (error: ApiError) => apiErrorMessage(error, "Failed to delete column"),
		});

	return {
		deleteColumn,
		isDeletingColumn,
	};
};
