import type { AddColumnSchemaType } from "@db-studio/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { addColumn as addColumnRequest } from "@/shared/api";
import { tableKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";
import { useSheetStore } from "@/stores/sheet.store";

type MutationError = Error & {
	details?: unknown;
};

const normalizeAddColumnPayload = (data: AddColumnSchemaType): AddColumnSchemaType => ({
	...data,
	defaultValue: data.defaultValue?.trim() ? data.defaultValue.trim() : undefined,
});

export const useAddColumn = ({ tableName }: { tableName: string }) => {
	const queryClient = useQueryClient();
	const { closeSheet } = useSheetStore();
	const { selectedDatabase } = useDatabaseStore();

	const { mutateAsync: addColumnMutation, isPending: isAddingColumn } = useMutation<
		string,
		MutationError,
		AddColumnSchemaType
	>({
		mutationFn: async (data) => {
			const res = await addColumnRequest({
				tableName,
				data: normalizeAddColumnPayload(data),
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
			closeSheet("add-column");
		},
	});

	const addColumn = async (
		data: AddColumnSchemaType,
		options?: {
			onSuccess?: () => void;
			onError?: (error: MutationError) => void;
		},
	) =>
		toast.promise(addColumnMutation(data, options), {
			loading: "Adding column...",
			success: (message) => message || "Column added successfully",
			error: (error: MutationError) =>
				(typeof error.details === "string" && error.details) ||
				error.message ||
				"Failed to add column",
		});

	return {
		addColumn,
		isAddingColumn,
	};
};
