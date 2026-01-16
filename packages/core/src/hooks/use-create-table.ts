import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DEFAULTS } from "shared/constants";
import { toast } from "sonner";
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
			const url = new URL(`${DEFAULTS.BASE_URL}/tables`);
			if (selectedDatabase) {
				url.searchParams.set("database", selectedDatabase);
			}
			const res = await fetch(url.toString(), {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(data),
			});
			if (!res.ok) {
				const errorData = await res.json();
				console.log("Error:", errorData);
				throw new Error(errorData.message || "Failed to create table");
			}
			console.log(data);
			return res.json();
		},
		onSuccess: async (data) => {
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
			console.log("Table created successfully:", data);
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
			success: (result) => result.message || "Table created successfully",
			error: (error: Error & { detail?: string }) =>
				error.detail || error.message || "Failed to create table",
		});
	};

	return {
		createTable,
		isCreatingTable,
	};
};
