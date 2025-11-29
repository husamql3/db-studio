import { useMutation, useQueryClient } from "@tanstack/react-query";
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

	const { mutateAsync: createTable, isPending: isCreatingTable } = useMutation({
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
			return res.json();
		},
		onSuccess: async (data) => {
			// Invalidate the tables list query to refetch the updated list
			await queryClient.invalidateQueries({
				queryKey: [CACHE_KEYS.TABLES_LIST],
			});

			closeSheet();
			console.log("Table created successfully:", data);
		},
		onError: (error) => {
			console.error("Error creating table:", error);
			// TODO: Show error toast
		},
	});

	return {
		createTable,
		isCreatingTable,
	};
};
