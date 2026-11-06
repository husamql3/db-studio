import type { AddColumnSchemaType } from "@db-studio/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { posthogAnalytics } from "@/lib/posthog";
import { addColumn as addColumnRequest, type ApiError, apiErrorMessage } from "@/shared/api";
import { invalidateTable } from "@/shared/query/invalidate-table";
import { useDatabaseStore } from "@/stores/database.store";
import { useOverlayStore } from "@/stores/overlay.store";

const normalizeAddColumnPayload = (data: AddColumnSchemaType): AddColumnSchemaType => ({
	...data,
	defaultValue: data.defaultValue?.trim() ? data.defaultValue.trim() : undefined,
});

export const useAddColumn = ({
	tableName,
	schemaName,
}: {
	tableName: string;
	schemaName: string | undefined;
}) => {
	const queryClient = useQueryClient();
	const { closeOverlay } = useOverlayStore();
	const { selectedDatabase, dbType } = useDatabaseStore();

	const { mutateAsync: addColumnMutation, isPending: isAddingColumn } = useMutation<
		string,
		ApiError,
		AddColumnSchemaType
	>({
		mutationFn: async (data) => {
			const res = await addColumnRequest({
				tableName,
				schemaName,
				data: normalizeAddColumnPayload(data),
				db: selectedDatabase,
			});

			return res.data.data;
		},
		onSuccess: async () => {
			await invalidateTable(queryClient, tableName);
			closeOverlay("schema.add-column");

			if (dbType) posthogAnalytics.capture("column_added", { db_type: dbType });
		},
	});

	const addColumn = async (data: AddColumnSchemaType) =>
		toast.promise(addColumnMutation(data), {
			loading: "Adding column...",
			success: (message) => message || "Column added successfully",
			error: (error: ApiError) => apiErrorMessage(error, "Failed to add column"),
		});

	return {
		addColumn,
		isAddingColumn,
	};
};
