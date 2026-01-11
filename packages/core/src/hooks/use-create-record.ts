import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useDatabaseStore } from "@/stores/database.store";
import { useSheetStore } from "@/stores/sheet.store";
import { API_URL, CONSTANTS } from "@/utils/constants";

export interface AddRecordFormData {
	[key: string]: string;
}

export const useCreateRecord = ({ tableName }: { tableName: string }) => {
	const queryClient = useQueryClient();
	const { closeSheet } = useSheetStore();
	const { selectedDatabase } = useDatabaseStore();

	const { mutateAsync: createRecordMutation, isPending: isCreatingRecord } = useMutation({
		mutationFn: async (data: AddRecordFormData) => {
			console.log("payload", {
				tableName: tableName,
				data,
			});
			const url = new URL(`${API_URL}/records`);
			if (selectedDatabase) {
				url.searchParams.set("database", selectedDatabase);
			}
			const res = await fetch(url.toString(), {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					tableName: tableName,
					data,
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
					queryKey: [CONSTANTS.CACHE_KEYS.TABLE_DATA, tableName],
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
