import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BaseResponse, DeleteTableResult, RelatedRecord } from "shared/types";
import { api } from "@/lib/api";
import { useDatabaseStore } from "@/stores/database.store";
import { CONSTANTS } from "@/utils/constants";

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
			const response = await api.delete<BaseResponse<DeleteTableResult>>(
				`/tables/${tableName}`,
				{
					params: {
						db: selectedDatabase ?? "",
						cascade: cascade ? "true" : "false",
					},
				},
			);
			return response.data.data;
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: [CONSTANTS.CACHE_KEYS.TABLES_LIST],
			});
		},
	});

	const deleteTable = async (tableName: string): Promise<DeleteTableResult> => {
		return deleteTableAsync({ tableName, cascade: false });
	};

	const forceDeleteTable = async (tableName: string): Promise<DeleteTableResult> => {
		return deleteTableAsync({ tableName, cascade: true });
	};

	return {
		deleteTable,
		forceDeleteTable,
		isDeletingTable,
		resetDeleteResult,
	};
};

export type { RelatedRecord };
