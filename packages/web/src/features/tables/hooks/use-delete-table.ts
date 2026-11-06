import type { DeleteTableResult } from "@db-studio/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	deleteTable as deleteTableRequest,
	type ApiError,
	apiErrorMessage,
} from "@/shared/api";
import { indexKeys, tableKeys } from "@/shared/query/keys";
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
		// Drop a deleted table's entries rather than invalidate them: a refetch would ask for a
		// table that no longer exists.
		onSuccess: async (result, { tableName }) => {
			await queryClient.invalidateQueries({ queryKey: tableKeys.lists() });

			if (result.fkViolation) {
				return;
			}

			for (const queryKey of [
				tableKeys.dataByTable(tableName),
				tableKeys.columnsByTable(tableName),
				indexKeys.byTable(tableName),
			]) {
				queryClient.removeQueries({ queryKey });
			}
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
