import type { RenameColumnSchemaType } from "@db-studio/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { renameColumn as renameColumnRequest } from "@/shared/api";
import { tableKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";

type MutationError = Error & {
	details?: unknown;
};

export const useRenameColumn = ({
	tableName,
	columnName,
}: {
	tableName: string;
	columnName: string;
}) => {
	const queryClient = useQueryClient();
	const { selectedDatabase } = useDatabaseStore();

	const { mutateAsync: renameColumnMutation, isPending: isRenamingColumn } = useMutation<
		string,
		MutationError,
		RenameColumnSchemaType
	>({
		mutationFn: async (data) => {
			const res = await renameColumnRequest({
				tableName,
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

	const renameColumn = async (
		data: RenameColumnSchemaType,
		options?: {
			onSuccess?: () => void;
			onError?: (error: MutationError) => void;
		},
	) =>
		toast.promise(renameColumnMutation(data, options), {
			loading: "Renaming column...",
			success: (message) => message || "Column renamed successfully",
			error: (error: MutationError) =>
				(typeof error.details === "string" && error.details) ||
				error.message ||
				"Failed to rename column",
		});

	return {
		renameColumn,
		isRenamingColumn,
	};
};
