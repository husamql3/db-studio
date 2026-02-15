import { useMutation } from "@tanstack/react-query";
import type { BaseResponse, TableSchemaResult } from "shared/types";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useDatabaseStore } from "@/stores/database.store";

export const useCopyTableSchema = () => {
	const { selectedDatabase } = useDatabaseStore();

	const { mutateAsync: copyTableSchemaMutation, isPending: isCopyingSchema } = useMutation({
		mutationFn: async (tableName: string) => {
			const res = await api.get<BaseResponse<TableSchemaResult>>(
				`/tables/${tableName}/schema`,
				{
					params: {
						db: selectedDatabase ?? "",
					},
				},
			);

			const schema = res.data.data.schema;
			await navigator.clipboard.writeText(schema);
			return schema;
		},
	});

	const copyTableSchema = async (tableName: string) => {
		return toast.promise(copyTableSchemaMutation(tableName), {
			loading: "Copying table schema...",
			success: "Table schema copied to clipboard",
			error: (error: Error) => error.message || "Failed to copy table schema",
		});
	};

	return {
		copyTableSchema,
		isCopyingSchema,
	};
};
