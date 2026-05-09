import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { posthogAnalytics } from "@/lib/posthog";
import { createRecord as createRecordRequest } from "@/shared/api";
import { tableKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";
import { useOverlayStore } from "@/stores/overlay.store";

export interface AddRecordFormData {
	[key: string]: string;
}

export const useCreateRecord = ({ tableName }: { tableName: string }) => {
	const queryClient = useQueryClient();
	const { closeOverlay } = useOverlayStore();
	const { selectedDatabase, dbType } = useDatabaseStore();

	const { mutateAsync: createRecordMutation, isPending: isCreatingRecord } = useMutation({
		mutationFn: async (data: AddRecordFormData) => {
			const res = await createRecordRequest({
				tableName,
				data,
				db: selectedDatabase,
			});
			return res.data.data;
		},
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: tableKeys.dataByTable(tableName),
					exact: false,
				}),
				queryClient.invalidateQueries({
					queryKey: tableKeys.lists(),
				}),
			]);
			closeOverlay("records.add-record");
			if (dbType) posthogAnalytics.capture("record_created", { db_type: dbType });
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
