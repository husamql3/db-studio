import type { RenameTableSchemaType } from "@db-studio/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	renameTable as renameTableRequest,
	type ApiError,
	apiErrorMessage,
} from "@/shared/api";
import { tableKeys } from "@/shared/query/keys";
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
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: tableKeys.lists(),
			});
			await queryClient.removeQueries({
				queryKey: tableKeys.dataByTable(tableName),
			});
			await queryClient.removeQueries({
				queryKey: tableKeys.columnsByTable(tableName),
			});
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
