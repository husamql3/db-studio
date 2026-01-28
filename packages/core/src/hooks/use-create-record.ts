import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BaseResponse } from "shared/types";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useDatabaseStore } from "@/stores/database.store";
import { useSheetStore } from "@/stores/sheet.store";
import { CONSTANTS } from "@/utils/constants";

export interface AddRecordFormData {
	[key: string]: string;
}

export const useCreateRecord = ({ tableName }: { tableName: string }) => {
	const queryClient = useQueryClient();
	const { closeSheet } = useSheetStore();
	const { selectedDatabase } = useDatabaseStore();

	const { mutateAsync: createRecordMutation, isPending: isCreatingRecord } = useMutation({
		mutationFn: async (data: AddRecordFormData) => {
			const params = new URLSearchParams({ db: selectedDatabase ?? "" });
			const res = await api.post<BaseResponse<string>>(
				"/records",
				{ tableName, data },
				{ params },
			);
			return res.data.data;
		},
		onSuccess: async (message) => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: [CONSTANTS.CACHE_KEYS.TABLE_DATA, tableName],
					exact: false,
				}),
				queryClient.invalidateQueries({
					queryKey: [CONSTANTS.CACHE_KEYS.TABLES_LIST],
				}),
			]);
			closeSheet("add-record");
			console.log("Record created successfully:", message);
		},
		onError: (error: Error & { detail?: string }) => {
			console.error("Error creating record:", error);
		},
	});

	const createRecord = async (
		data: AddRecordFormData,
		options: {
			onSuccess?: () => void;
			onError?: (error: Error & { detail?: string }) => void;
		},
	) => {
		if (!data || Object.keys(data).length === 0) {
			throw new Error("At least one field is required");
		}
		return toast.promise(createRecordMutation(data, options), {
			loading: "Creating record...",
			success: (message) => message || "Record created successfully",
			error: (error: Error & { detail?: string }) =>
				error.detail || error.message || "Failed to create record",
		});
	};

	return {
		createRecord,
		isCreatingRecord,
	};
};
