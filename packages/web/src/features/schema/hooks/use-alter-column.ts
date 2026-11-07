import type { AlterColumnSchemaType } from "@db-studio/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	alterColumn as alterColumnRequest,
	type ApiError,
	apiErrorMessage,
} from "@/shared/api";
import { invalidateTable } from "@/shared/query/invalidate-table";
import { useDatabaseStore } from "@/stores/database.store";
import { useOverlayStore } from "@/stores/overlay.store";
import { useSchemaEditStore } from "../stores/schema-edit.store";

const normalizeAlterColumnPayload = (data: AlterColumnSchemaType): AlterColumnSchemaType => ({
	...data,
	defaultValue: data.defaultValue?.trim() ? data.defaultValue.trim() : null,
});

export const useAlterColumn = ({
	tableName,
	schemaName,
	columnName,
}: {
	tableName: string;
	schemaName: string | undefined;
	columnName: string;
}) => {
	const queryClient = useQueryClient();
	const { closeOverlay } = useOverlayStore();
	const { setEditingColumn } = useSchemaEditStore();
	const { selectedDatabase } = useDatabaseStore();

	const { mutateAsync: alterColumnMutation, isPending: isAlteringColumn } = useMutation<
		string,
		ApiError,
		AlterColumnSchemaType
	>({
		mutationFn: async (data) => {
			const res = await alterColumnRequest({
				tableName,
				schemaName,
				columnName,
				data: normalizeAlterColumnPayload(data),
				db: selectedDatabase,
			});

			return res.data.data;
		},
		onSuccess: async () => {
			await invalidateTable(queryClient, tableName);
			setEditingColumn(null);
			closeOverlay("schema.edit-column");
		},
	});

	const alterColumn = async (data: AlterColumnSchemaType) =>
		toast
			.promise(alterColumnMutation(data), {
				loading: "Updating column...",
				success: (message) => message || "Column updated successfully",
				error: (error: ApiError) => apiErrorMessage(error, "Failed to update column"),
			})
			.unwrap();

	return {
		alterColumn,
		isAlteringColumn,
	};
};
