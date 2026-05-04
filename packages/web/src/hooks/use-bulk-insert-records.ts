import type { BulkInsertResult } from "@db-studio/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { bulkInsertRecords as bulkInsertRecordsRequest } from "@/shared/api";
import { tableKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";
import { useSheetStore } from "@/stores/sheet.store";

export const useBulkInsertRecords = ({ tableName }: { tableName: string }) => {
	const queryClient = useQueryClient();
	const { closeSheet } = useSheetStore();
	const { selectedDatabase } = useDatabaseStore();

	const { mutateAsync: bulkInsertMutation, isPending: isInserting } = useMutation({
		mutationFn: async (records: Record<string, unknown>[]) => {
			const res = await bulkInsertRecordsRequest({
				tableName,
				records,
				db: selectedDatabase,
			});
			return res.data.data;
		},
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: tableKeys.dataByTable(tableName),
					exact: false,
				}),
				queryClient.invalidateQueries({
					queryKey: tableKeys.lists(),
					exact: false,
				}),
				queryClient.invalidateQueries({
					queryKey: tableKeys.columnsByTable(tableName),
					exact: false,
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
