import type { DeleteTableResult } from "@db-studio/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	deleteTable as deleteTableRequest,
	type ApiError,
	apiErrorMessage,
} from "@/shared/api";
import { forgetTable } from "@/shared/query/invalidate-table";
import { tableKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";

export const useDeleteTable = () => {
	const queryClient = useQueryClient();
	const { selectedDatabase } = useDatabaseStore();

	const {
		mutateAsync: deleteTableAsync,
		isPending: isDeletingTable,
		reset: resetDeleteResult,
	} = useMutation({
		mutationFn: async ({
			tableName,
			schemaName,
			cascade = false,
		}: {
			tableName: string;
			schemaName: string | undefined;
			cascade?: boolean;
		}): Promise<DeleteTableResult> => {
			const response = await deleteTableRequest({
				tableName,
				schemaName,
				db: selectedDatabase,
				cascade,
			});

			return response.data.data;
		},
		onSuccess: async (result, { tableName }) => {
			await queryClient.invalidateQueries({ queryKey: tableKeys.lists() });

			if (!result.fkViolation) forgetTable(queryClient, tableName);
		},
	});

	const deleteTable = async (
		tableName: string,
		schemaName: string | undefined,
	): Promise<DeleteTableResult> => {
		const promise = deleteTableAsync({ tableName, schemaName, cascade: false });
		toast.promise(promise, {
			loading: "Deleting table...",
			success: (result) =>
				result.fkViolation
					? `Table "${tableName}" has related records`
					: `Deleted table "${tableName}" with ${result.deletedCount} rows`,
			error: (error: ApiError) => apiErrorMessage(error, "Failed to delete table"),
		});

		return promise;
	};

	const forceDeleteTable = async (
		tableName: string,
		schemaName: string | undefined,
	): Promise<DeleteTableResult> => {
		const promise = deleteTableAsync({ tableName, schemaName, cascade: true });
		toast.promise(promise, {
			loading: "Deleting table...",
			success: (result) =>
				`Force deleted table "${tableName}" with ${result.deletedCount} rows`,
			error: (error: ApiError) => apiErrorMessage(error, "Failed to delete table"),
		});

		return promise;
	};

	return {
		deleteTable,
		forceDeleteTable,
		isDeletingTable,
		resetDeleteResult,
	};
};
