import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useActiveTableStore } from "@/stores/active-table.store";
import { useSheetStore } from "@/stores/sheet.store";
import { API_URL, CACHE_KEYS } from "@/utils/constants/constans";

export interface AddRecordFormData {
	[key: string]: string;
}

export const useCreateRecord = () => {
	const queryClient = useQueryClient();
	const { activeTable } = useActiveTableStore();
	const { closeSheet } = useSheetStore();

	const { mutateAsync: createRecordMutation, isPending: isCreatingRecord } = useMutation({
		mutationFn: async (data: AddRecordFormData) => {
			console.log("payload", data);
			const res = await fetch(`${API_URL}/records`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					tableName: activeTable,
					...data,
				}),
			});
			if (!res.ok) {
				const errorData = await res.json();
				throw new Error(errorData.message || "Failed to create record");
			}
			return res.json();
		},
		onSuccess: async (data) => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: [CACHE_KEYS.TABLE_DATA, activeTable],
					exact: false,
				}),
				queryClient.invalidateQueries({
					queryKey: [CACHE_KEYS.TABLES_LIST],
				}),
			]);
			closeSheet("add-row");
			console.log("Record created successfully:", data);
		},
		onError: (error: Error & { detail?: string }) => {
			console.error("Error creating record:", error);
		},
	});

	const createRecord = async (data: AddRecordFormData) => {
		return toast.promise(createRecordMutation(data), {
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
