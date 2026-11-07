import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { posthogAnalytics } from "@/lib/posthog";
import {
	createRecord as createRecordRequest,
	type AddRecordFormData,
	type ApiError,
	apiErrorMessage,
} from "@/shared/api";
import { invalidateTableRows } from "@/shared/query/invalidate-table";
import { useDatabaseStore } from "@/stores/database.store";

export const useCreateRecord = ({
	tableName,
	schemaName,
}: {
	tableName: string;
	schemaName: string | undefined;
}) => {
	const queryClient = useQueryClient();
	const { selectedDatabase, dbType } = useDatabaseStore();

	const { mutateAsync: createRecordMutation, isPending: isCreatingRecord } = useMutation<
		string,
		ApiError,
		AddRecordFormData
	>({
		mutationFn: async (data) => {
			const res = await createRecordRequest({
				tableName,
				schemaName,
				data,
				db: selectedDatabase,
			});

			return res.data.data;
		},
		onSuccess: async () => {
			await invalidateTableRows(queryClient, tableName);

			if (dbType) posthogAnalytics.capture("record_created", { db_type: dbType });
		},
	});

	const createRecord = async (
		data: AddRecordFormData,
		options: {
			onSuccess?: () => void;
			onError?: (error: ApiError) => void;
		},
	) => {
		return toast.promise(createRecordMutation(data, options), {
			loading: "Creating record...",
			success: (message) => message || "Record created successfully",
			error: (error: ApiError) => apiErrorMessage(error, "Failed to create record"),
		});
	};

	return {
		createRecord,
		isCreatingRecord,
	};
};
