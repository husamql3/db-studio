import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BaseResponse, RenameColumnSchemaType } from "shared/types";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useDatabaseStore } from "@/stores/database.store";
import { CONSTANTS } from "@/utils/constants";

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
			const params = new URLSearchParams({ db: selectedDatabase ?? "" });
			const res = await api.patch<BaseResponse<string>>(
				`/tables/${encodeURIComponent(tableName)}/columns/${encodeURIComponent(columnName)}/rename`,
				data,
				{ params },
			);
			return res.data.data;
		},
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: [CONSTANTS.CACHE_KEYS.TABLE_COLUMNS, tableName],
					exact: false,
				}),
				queryClient.invalidateQueries({
					queryKey: [CONSTANTS.CACHE_KEYS.TABLE_DATA, tableName],
					exact: false,
				}),
			]);
		},
		onError: (error) => {
			console.error("Error renaming column:", error);
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
