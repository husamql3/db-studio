import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DeleteTableResult, RelatedRecord } from "shared/types";
import { toast } from "sonner";
import { deleteTable as deleteTableRequest } from "@/shared/api";
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
			cascade = false,
		}: {
			tableName: string;
			cascade?: boolean;
		}): Promise<DeleteTableResult> => {
			const response = await deleteTableRequest({
				tableName,
				db: selectedDatabase,
				cascade,
			});
			return response.data.data;
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: tableKeys.lists(),
			});
		},
	});

	const deleteTable = async (tableName: string): Promise<DeleteTableResult> => {
		const promise = deleteTableAsync({ tableName, cascade: false });
		toast.promise(promise, {
			loading: "Deleting table...",
			success: (result) =>
				result.fkViolation
					? `Table "${tableName}" has related records`
					: `Deleted table "${tableName}" with ${result.deletedCount} rows`,
			error: (error: Error) => error.message || "Failed to delete table",
		});
		return promise;
	};

	const forceDeleteTable = async (tableName: string): Promise<DeleteTableResult> => {
		const promise = deleteTableAsync({ tableName, cascade: true });
		toast.promise(promise, {
			loading: "Deleting table...",
			success: (result) =>
				`Force deleted table "${tableName}" with ${result.deletedCount} rows`,
			error: (error: Error) => error.message || "Failed to delete table",
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

export type { RelatedRecord };
