import type { CreateTableSchemaType } from "@db-studio/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { posthogAnalytics } from "@/lib/posthog";
import { createTable as createTableRequest } from "@/shared/api";
import { tableKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";
import { useOverlayStore } from "@/stores/overlay.store";

export const useCreateTable = () => {
	const { closeOverlay } = useOverlayStore();
	const queryClient = useQueryClient();
	const { selectedDatabase, dbType } = useDatabaseStore();

	const { mutateAsync: createTableMutation, isPending: isCreatingTable } = useMutation({
		mutationFn: async (data: CreateTableSchemaType) => {
			const res = await createTableRequest(data, selectedDatabase);
			return res.data.data;
		},
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: tableKeys.lists() }),
				queryClient.invalidateQueries({ queryKey: tableKeys.columns() }),
			]);
			closeOverlay("table-builder.create-table");
			if (dbType) posthogAnalytics.capture("table_created", { db_type: dbType });
		},
	});

	const createTable = async (
		data: CreateTableSchemaType,
		options: {
			onSuccess?: () => void;
			onError?: (error: Error & { detail?: string }) => void;
		},
	) => {
		return toast.promise(createTableMutation(data, options), {
			loading: "Creating table...",
			success: (message) => message || "Table created successfully",
			error: (error: Error & { detail?: string }) =>
				error.detail || error.message || "Failed to create table",
		});
	};

	return {
		createTable,
		isCreatingTable,
	};
};
