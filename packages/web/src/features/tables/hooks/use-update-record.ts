import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { posthogAnalytics } from "@/lib/posthog";
import { updateRecords } from "@/shared/api";
import { tableKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";

export type RowFieldUpdate = {
	columnName: string;
	value: unknown;
};

export const useUpdateRecord = ({ tableName }: { tableName: string }) => {
	const queryClient = useQueryClient();
	const { selectedDatabase, dbType } = useDatabaseStore();

	const { mutateAsync: updateRecordMutation, isPending: isUpdatingRecord } = useMutation({
		mutationFn: async ({
			rowData,
			updates,
			primaryKey,
		}: {
			rowData: Record<string, unknown>;
			updates: RowFieldUpdate[];
			primaryKey?: string;
		}) => {
			if (!tableName) {
				throw new Error("No table selected");
			}
			if (updates.length === 0) {
				throw new Error("At least one field is required");
			}
			const res = await updateRecords({
				tableName,
				updates: updates.map((update) => ({ rowData, ...update })),
				...(primaryKey ? { primaryKey } : {}),
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
				}),
			]);
			if (dbType) posthogAnalytics.capture("record_updated", { db_type: dbType });
		},
	});

	const updateRecord = async ({
		rowData,
		updates,
		primaryKey,
	}: {
		rowData: Record<string, unknown>;
		updates: RowFieldUpdate[];
		primaryKey?: string;
	}) => {
		if (updates.length === 0) {
			throw new Error("At least one field is required");
		}
		return toast
			.promise(updateRecordMutation({ rowData, updates, primaryKey }), {
				loading: "Saving changes...",
				success: (message) => message || "Record updated successfully",
				error: (error: Error) => error.message || "Failed to update record",
			})
			.unwrap();
	};

	return {
		updateRecord,
		isUpdatingRecord,
	};
};
