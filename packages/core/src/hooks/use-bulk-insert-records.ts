import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { BulkInsertResult } from "shared/types";
import { fetcher } from "@/lib/fetcher";
import { useDatabaseStore } from "@/stores/database.store";
import { useSheetStore } from "@/stores/sheet.store";
import { CONSTANTS } from "@/utils/constants";

export const useBulkInsertRecords = ({ tableName }: { tableName: string }) => {
	const queryClient = useQueryClient();
	const { closeSheet } = useSheetStore();
	const { selectedDatabase } = useDatabaseStore();

	const { mutateAsync: bulkInsertMutation, isPending: isInserting } =
		useMutation({
			mutationFn: (records: Record<string, unknown>[]) =>
				fetcher.post<BulkInsertResult>(
					"/records/bulk",
					{ tableName, records },
					{ params: { database: selectedDatabase } },
				),
			onSuccess: async () => {
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: [CONSTANTS.CACHE_KEYS.TABLE_DATA, tableName],
						exact: false,
					}),
					queryClient.invalidateQueries({
						queryKey: [CONSTANTS.CACHE_KEYS.TABLES_LIST],
					}),
				]);
				closeSheet("bulk-insert-records");
			},
		});

	const bulkInsertRecords = async (
		records: Record<string, unknown>[],
		options?: {
			onSuccess?: (result: BulkInsertResult) => void;
			onError?: (error: Error & { detail?: string }) => void;
		},
	) => {
		if (!records || records.length === 0) {
			throw new Error("At least one record is required");
		}

		return toast.promise(bulkInsertMutation(records), {
			loading: `Inserting ${records.length} record${records.length !== 1 ? "s" : ""}...`,
			success: (result) => {
				options?.onSuccess?.(result);
				if (result.failureCount > 0) {
					return `${result.successCount} records inserted, ${result.failureCount} failed`;
				}
				return result.message;
			},
			error: (error: Error & { detail?: string }) => {
				options?.onError?.(error);
				return error.detail || error.message || "Failed to insert records";
			},
		});
	};

	return {
		bulkInsertRecords,
		isInserting,
	};
};
