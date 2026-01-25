import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetcher } from "@/lib/fetcher";
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
		mutationFn: (data: AddRecordFormData) =>
			fetcher.post<{ message?: string }>(
				"/records",
				{ tableName, data },
				{ params: { database: selectedDatabase } },
			),
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
