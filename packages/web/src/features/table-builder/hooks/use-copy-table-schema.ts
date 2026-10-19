import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { getTableSchema } from "@/shared/api";
import { useDatabaseStore } from "@/stores/database.store";

export const useCopyTableSchema = () => {
	const { selectedDatabase } = useDatabaseStore();

	const { mutateAsync: copyTableSchemaMutation, isPending: isCopyingSchema } = useMutation({
		mutationFn: async ({
			tableName,
			schemaName,
		}: {
			tableName: string;
			schemaName: string | undefined;
		}) => {
			const res = await getTableSchema(tableName, selectedDatabase, schemaName);
			const schema = res.data.data.schema;
			await navigator.clipboard.writeText(schema);
			return schema;
		},
	});

	const copyTableSchema = async (tableName: string, schemaName: string | undefined) => {
		return toast.promise(copyTableSchemaMutation({ tableName, schemaName }), {
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
