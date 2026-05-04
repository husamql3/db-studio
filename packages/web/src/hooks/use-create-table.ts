import type { CreateTableSchemaType } from "@db-studio/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createTable as createTableRequest } from "@/shared/api";
import { tableKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";
import { useSheetStore } from "@/stores/sheet.store";

export const useCreateTable = () => {
	const { closeSheet } = useSheetStore();
	const queryClient = useQueryClient();
	const { selectedDatabase } = useDatabaseStore();

	const { mutateAsync: createTableMutation, isPending: isCreatingTable } = useMutation({
		mutationFn: async (data: CreateTableSchemaType) => {
			const res = await createTableRequest(data, selectedDatabase);
			return res.data.data;
		},
		onSuccess: async () => {
			// Invalidate the tables list and table names queries to refetch the updated lists
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: tableKeys.lists(),
				}),
				queryClient.invalidateQueries({
					queryKey: tableKeys.columns(),
				}),
			]);

			closeSheet();
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
