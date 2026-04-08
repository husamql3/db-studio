import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AddColumnSchemaType, BaseResponse } from "shared/types";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useDatabaseStore } from "@/stores/database.store";
import { useSheetStore } from "@/stores/sheet.store";
import { CONSTANTS } from "@/utils/constants";

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
			const params = new URLSearchParams({ db: selectedDatabase ?? "" });
			const res = await api.post<BaseResponse<string>>(
				`/tables/${encodeURIComponent(tableName)}/columns`,
				normalizeAddColumnPayload(data),
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
			closeSheet("add-column");
		},
		onError: (error) => {
			console.error("Error adding column:", error);
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
