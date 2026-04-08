import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AlterColumnSchemaType, BaseResponse } from "shared/types";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useDatabaseStore } from "@/stores/database.store";
import { useSchemaEditStore } from "@/stores/schema-edit.store";
import { useSheetStore } from "@/stores/sheet.store";
import { CONSTANTS } from "@/utils/constants";

type MutationError = Error & {
	details?: unknown;
};

const normalizeAlterColumnPayload = (data: AlterColumnSchemaType): AlterColumnSchemaType => ({
	...data,
	defaultValue: data.defaultValue?.trim() ? data.defaultValue.trim() : null,
});

export const useAlterColumn = ({
	tableName,
	columnName,
}: {
	tableName: string;
	columnName: string;
}) => {
	const queryClient = useQueryClient();
	const { closeSheet } = useSheetStore();
	const { setEditingColumn } = useSchemaEditStore();
	const { selectedDatabase } = useDatabaseStore();

	const { mutateAsync: alterColumnMutation, isPending: isAlteringColumn } = useMutation<
		string,
		MutationError,
		AlterColumnSchemaType
	>({
		mutationFn: async (data) => {
			const params = new URLSearchParams({ db: selectedDatabase ?? "" });
			const res = await api.patch<BaseResponse<string>>(
				`/tables/${encodeURIComponent(tableName)}/columns/${encodeURIComponent(columnName)}`,
				normalizeAlterColumnPayload(data),
				{ params },
			);
			return res.data.data;
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: [CONSTANTS.CACHE_KEYS.TABLE_COLUMNS, tableName],
				exact: false,
			});
			setEditingColumn(null);
			closeSheet("edit-column");
		},
		onError: (error) => {
			console.error("Error altering column:", error);
		},
	});

	const alterColumn = async (
		data: AlterColumnSchemaType,
		options?: {
			onSuccess?: () => void;
			onError?: (error: MutationError) => void;
		},
	) =>
		toast.promise(alterColumnMutation(data, options), {
			loading: "Updating column...",
			success: (message) => message || "Column updated successfully",
			error: (error: MutationError) =>
				(typeof error.details === "string" && error.details) ||
				error.message ||
				"Failed to update column",
		});

	return {
		alterColumn,
		isAlteringColumn,
	};
};
