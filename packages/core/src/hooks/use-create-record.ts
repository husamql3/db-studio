import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { toast } from "sonner";
import { useSheetStore } from "@/stores/sheet.store";
import { API_URL, CONSTANTS } from "@/utils/constants";

export interface AddRecordFormData {
	[key: string]: string;
}

export const useCreateRecord = () => {
	const queryClient = useQueryClient();
	const [activeTable] = useQueryState(CONSTANTS.ACTIVE_TABLE);
	const { closeSheet } = useSheetStore();

	const { mutateAsync: createRecordMutation, isPending: isCreatingRecord } = useMutation({
		mutationFn: async (data: AddRecordFormData) => {
			console.log("payload", {
				tableName: activeTable,
				data: data,
			});
			const res = await fetch(`${API_URL}/records`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					tableName: activeTable,
					data: data,
				}),
			});
			if (!res.ok) {
				const errorData = await res.json();
				throw new Error(errorData.detail || "Failed to create record");
			}
			return res.json();
		},
		onSuccess: async (data) => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: [CONSTANTS.CACHE_KEYS.TABLE_DATA, activeTable],
					exact: false,
				}),
				queryClient.invalidateQueries({
					queryKey: [CONSTANTS.CACHE_KEYS.TABLES_LIST],
				}),
			]);
			closeSheet("add-record");
			console.log("Record created successfully:", data);
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
			success: (result) => result.message || "Record created successfully",
			error: (error: Error & { detail?: string }) =>
				error.detail || error.message || "Failed to create record",
		});
	};

	return {
		createRecord,
		isCreatingRecord,
	};
};
