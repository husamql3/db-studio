import type { RenameTableSchemaType } from "@db-studio/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	renameTable as renameTableRequest,
	type ApiError,
	apiErrorMessage,
} from "@/shared/api";
import { indexKeys, tableKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";

export const useRenameTable = ({
	tableName,
	schemaName,
}: {
	tableName: string;
	schemaName?: string;
}) => {
	const queryClient = useQueryClient();
	const { selectedDatabase } = useDatabaseStore();

	const { mutateAsync: renameTableMutation, isPending: isRenamingTable } = useMutation<
		string,
		ApiError,
		RenameTableSchemaType
	>({
		mutationFn: async (data) => {
			const res = await renameTableRequest({
				tableName,
				data: { ...data, schemaName },
				db: selectedDatabase,
			});

			return res.data.data;
		},
		// Drop the old name's entries rather than invalidate them: a refetch would ask for a
		// table that no longer exists before the caller navigates to the new name.
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: tableKeys.lists() });

			for (const queryKey of [
				tableKeys.dataByTable(tableName),
				tableKeys.columnsByTable(tableName),
				indexKeys.byTable(tableName),
			]) {
				queryClient.removeQueries({ queryKey });
			}
		},
	});

	const renameTable = async (data: RenameTableSchemaType) => {
		const promise = renameTableMutation(data);
		toast.promise(promise, {
			loading: "Renaming table...",
			success: (message) => message || "Table renamed successfully",
			error: (error: ApiError) => apiErrorMessage(error, "Failed to rename table"),
		});

		return promise;
	};

	return {
		renameTable,
		isRenamingTable,
	};
};
