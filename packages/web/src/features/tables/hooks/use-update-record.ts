import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { posthogAnalytics } from "@/lib/posthog";
import { updateRecords, type ApiError, apiErrorMessage } from "@/shared/api";
import { invalidateTableRows } from "@/shared/query/invalidate-table";
import { useDatabaseStore } from "@/stores/database.store";

export type RowFieldUpdate = {
	columnName: string;
	value: unknown;
};

export const useUpdateRecord = ({
	tableName,
	schemaName,
}: {
	tableName: string;
	schemaName: string | undefined;
}) => {
	const queryClient = useQueryClient();
	const { selectedDatabase, dbType } = useDatabaseStore();

	const { mutateAsync: updateRecordMutation, isPending: isUpdatingRecord } = useMutation({
		mutationFn: async ({
			rowData,
			updates,
			primaryKey,
			primaryKeys,
		}: {
			rowData: Record<string, unknown>;
			updates: RowFieldUpdate[];
			primaryKey?: string;
			primaryKeys?: string[];
		}) => {
			const payload: Parameters<typeof updateRecords>[0] = {
				tableName,
				schemaName,
				updates: updates.map((update) => ({ rowData, ...update })),
				db: selectedDatabase,
			};

			if (primaryKey) payload.primaryKey = primaryKey;

			if (primaryKeys?.length) payload.primaryKeys = primaryKeys;

			const res = await updateRecords(payload);

			return res.data.data;
		},
		onSuccess: async () => {
			await invalidateTableRows(queryClient, tableName);

			if (dbType) posthogAnalytics.capture("record_updated", { db_type: dbType });
		},
	});

	const updateRecord = async ({
		rowData,
		updates,
		primaryKey,
		primaryKeys,
	}: {
		rowData: Record<string, unknown>;
		updates: RowFieldUpdate[];
		primaryKey?: string;
		primaryKeys?: string[];
	}) => {
		if (updates.length === 0) {
			throw new Error("At least one field is required");
		}

		return toast
			.promise(updateRecordMutation({ rowData, updates, primaryKey, primaryKeys }), {
				loading: "Saving changes...",
				success: (message) => message || "Record updated successfully",
				error: (error: ApiError) => apiErrorMessage(error, "Failed to update record"),
			})
			.unwrap();
	};

	return {
		updateRecord,
		isUpdatingRecord,
	};
};
