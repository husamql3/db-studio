import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSheetStore } from "@/stores/sheet.store";
import { CACHE_KEYS } from "@/utils/constants/constans";

export interface FieldData {
	columnName: string;
	columnType: string;
	defaultValue: string;
	isPrimaryKey: boolean;
	isNullable: boolean;
	isUnique: boolean;
	isIdentity: boolean;
	isArray: boolean;
}

export interface AddTableFormData {
	tableName: string;
	fields: FieldData[];
}

export const useCreateTable = () => {
	const { closeSheet } = useSheetStore();
	const queryClient = useQueryClient();

	const { mutateAsync: createTableMutation, isPending: isCreatingTable } = useMutation({
		mutationFn: async (data: AddTableFormData) => {
			const res = await fetch("/api/tables", {
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
					queryKey: [CACHE_KEYS.TABLES_LIST],
				}),
				queryClient.invalidateQueries({
					queryKey: [CACHE_KEYS.TABLE_NAMES],
				}),
			]);

			closeSheet();
			console.log("Table created successfully:", data);
		},
		onError: (error: Error & { detail?: string }) => {
			console.error("Error creating table:", error);
		},
	});

	const createTable = async (data: AddTableFormData) => {
		return toast.promise(createTableMutation(data), {
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
