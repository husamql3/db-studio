import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BaseResponse } from "shared/types";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useDatabaseStore } from "@/stores/database.store";
import { useSheetStore } from "@/stores/sheet.store";
import { CONSTANTS } from "@/utils/constants";

interface FieldData {
	columnName: string;
	columnType: string;
	defaultValue: string;
	isPrimaryKey: boolean;
	isNullable: boolean;
	isUnique: boolean;
	isIdentity: boolean;
	isArray: boolean;
}

interface AddTableFormData {
	tableName: string;
	fields: FieldData[];
}

export const useCreateTable = () => {
	const { closeSheet } = useSheetStore();
	const queryClient = useQueryClient();
	const { selectedDatabase } = useDatabaseStore();

	const { mutateAsync: createTableMutation, isPending: isCreatingTable } = useMutation({
		mutationFn: async (data: AddTableFormData) => {
			const params = new URLSearchParams({ db: selectedDatabase ?? "" });
			const res = await api.post<BaseResponse<string>>("/tables", data, { params });
			return res.data.data;
		},
		onSuccess: async (message) => {
			// Invalidate the tables list and table names queries to refetch the updated lists
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: [CONSTANTS.CACHE_KEYS.TABLES_LIST],
				}),
				queryClient.invalidateQueries({
					queryKey: [CONSTANTS.CACHE_KEYS.TABLE_COLUMNS],
				}),
			]);

			closeSheet();
			console.log("Table created successfully:", message);
		},
		onError: (error: Error & { detail?: string }) => {
			console.error("Error creating table:", error);
		},
	});

	const createTable = async (
		data: AddTableFormData,
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
