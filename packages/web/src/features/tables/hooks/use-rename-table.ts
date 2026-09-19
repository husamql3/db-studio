import type { RenameTableSchemaType } from "@db-studio/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { renameTable as renameTableRequest } from "@/shared/api";
import { tableKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";
import { CONSTANTS } from "@/utils/constants";

type MutationError = Error & {
	details?: unknown;
};

export const useRenameTable = ({ tableName }: { tableName: string }) => {
	const queryClient = useQueryClient();
	const { selectedDatabase } = useDatabaseStore();

	const { mutateAsync: renameTableMutation, isPending: isRenamingTable } = useMutation<
		string,
		MutationError,
		RenameTableSchemaType
	>({
		mutationFn: async (data) => {
			const res = await renameTableRequest({
				tableName,
				data,
				db: selectedDatabase,
			});
			return res.data.data;
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: tableKeys.lists(),
			});
			await queryClient.removeQueries({
				queryKey: [CONSTANTS.CACHE_KEYS.TABLE_DATA, tableName],
			});
			await queryClient.removeQueries({
				queryKey: [CONSTANTS.CACHE_KEYS.TABLE_COLUMNS, tableName],
			});
		},
	});

	const renameTable = async (
		data: RenameTableSchemaType,
		options?: {
			onSuccess?: () => void;
			onError?: (error: MutationError) => void;
		},
	) => {
		const promise = renameTableMutation(data, options);
		toast.promise(promise, {
			loading: "Renaming table...",
			success: (message) => message || "Table renamed successfully",
			error: (error: MutationError) =>
				(typeof error.details === "string" && error.details) ||
				error.message ||
				"Failed to rename table",
		});
		return promise;
	};

	return {
		renameTable,
		isRenamingTable,
	};
};
