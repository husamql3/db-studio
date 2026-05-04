import type { AlterColumnSchemaType } from "@db-studio/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { alterColumn as alterColumnRequest } from "@/shared/api";
import { tableKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";
import { useSchemaEditStore } from "@/stores/schema-edit.store";
import { useSheetStore } from "@/stores/sheet.store";

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
			const res = await alterColumnRequest({
				tableName,
				columnName,
				data: normalizeAlterColumnPayload(data),
				db: selectedDatabase,
			});
			return res.data.data;
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: tableKeys.columnsByTable(tableName),
				exact: false,
			});
			setEditingColumn(null);
			closeSheet("edit-column");
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
