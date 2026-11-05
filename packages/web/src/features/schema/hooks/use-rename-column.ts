import type { RenameColumnSchemaType } from "@db-studio/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	renameColumn as renameColumnRequest,
	type ApiError,
	apiErrorMessage,
} from "@/shared/api";
import { tableKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";

export const useRenameColumn = ({
	tableName,
	schemaName,
	columnName,
}: {
	tableName: string;
	schemaName: string | undefined;
	columnName: string;
}) => {
	const queryClient = useQueryClient();
	const { selectedDatabase } = useDatabaseStore();

	const { mutateAsync: renameColumnMutation, isPending: isRenamingColumn } = useMutation<
		string,
		ApiError,
		RenameColumnSchemaType
	>({
		mutationFn: async (data) => {
			const res = await renameColumnRequest({
				tableName,
				schemaName,
				columnName,
				data,
				db: selectedDatabase,
			});

			return res.data.data;
		},
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: tableKeys.columnsByTable(tableName),
					exact: false,
				}),
				queryClient.invalidateQueries({
					queryKey: tableKeys.dataByTable(tableName),
					exact: false,
				}),
			]);
		},
	});

	const renameColumn = async (data: RenameColumnSchemaType) =>
		toast.promise(renameColumnMutation(data), {
			loading: "Renaming column...",
			success: (message) => message || "Column renamed successfully",
			error: (error: ApiError) => apiErrorMessage(error, "Failed to rename column"),
		});

	return {
		renameColumn,
		isRenamingColumn,
	};
};
