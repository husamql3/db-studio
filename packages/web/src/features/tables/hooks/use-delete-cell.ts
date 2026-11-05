import type { DeleteRecordResult } from "@db-studio/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { TableRecord } from "@/features/tables/table.type";
import { useTableCols } from "@/hooks/use-table-cols";
import { posthogAnalytics } from "@/lib/posthog";
import { type ApiError, apiErrorMessage, deleteRecords } from "@/shared/api";
import { tableKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";
import { getIdentityColumnNames } from "../utils/row-details-utils";

export const useDeleteCells = ({
	tableName,
	schemaName,
}: {
	tableName: string;
	schemaName: string | undefined;
}) => {
	const queryClient = useQueryClient();
	const { tableCols } = useTableCols({ tableName, schemaName });
	const { selectedDatabase, dbType } = useDatabaseStore();

	const {
		mutateAsync,
		isPending: isDeletingCells,
		reset: resetDeleteResult,
	} = useMutation<DeleteRecordResult, ApiError, { rows: TableRecord[]; force: boolean }>({
		mutationFn: async ({ rows, force }) => {
			// Rows are identified as an update identifies them.
			const keyColumns = getIdentityColumnNames(tableCols);

			if (keyColumns.length === 0) throw new Error("No primary key found for this table");

			// The delete endpoint matches every row on one key column.
			if (keyColumns.length > 1)
				throw new Error(
					"Deleting rows from tables with a composite primary key is not supported yet.",
				);

			const [keyColumn] = keyColumns;

			const { status, data: body } = await deleteRecords({
				tableName,
				schemaName,
				primaryKeys: rows.map((row) => ({ columnName: keyColumn, value: row[keyColumn] })),
				force,
				db: selectedDatabase,
			});

			if ("error" in body) {
				throw Object.assign(new Error(body.error), { status, details: body.details });
			}

			return body.data;
		},
		onSuccess: async (result) => {
			if (result.fkViolation) return;

			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: tableKeys.dataByTable(tableName),
					exact: false,
				}),
				queryClient.invalidateQueries({
					queryKey: tableKeys.lists(),
				}),
			]);

			if (dbType) posthogAnalytics.capture("record_deleted", { db_type: dbType });
		},
	});

	/**
	 * Resolves with `fkViolation` when other rows reference these; `force` deletes those
	 * referencing rows too.
	 */
	const deleteCells = (rows: TableRecord[], { force = false }: { force?: boolean } = {}) => {
		const promise = mutateAsync({ rows, force });
		toast.promise(promise, {
			loading: "Deleting records...",
			success: (result) =>
				result.fkViolation
					? `Other records reference these records in "${tableName}"`
					: `Deleted ${result.deletedCount} records from "${tableName}"`,
			error: (error: ApiError) => apiErrorMessage(error, "Failed to delete records"),
		});

		return promise;
	};

	return { deleteCells, isDeletingCells, resetDeleteResult };
};
