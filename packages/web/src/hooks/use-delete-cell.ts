import type { ColumnInfoSchemaType, DeleteRecordResult } from "@db-studio/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { toast } from "sonner";
import { useTableCols } from "@/hooks/use-table-cols";
import { deleteRecords } from "@/shared/api";
import { tableKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";

export interface RelatedRecord {
	tableName: string;
	columnName: string;
	constraintName: string;
	records: Array<Record<string, unknown>>;
}

export const useDeleteCells = ({ tableName }: { tableName: string }) => {
	const queryClient = useQueryClient();
	const { tableCols } = useTableCols({ tableName });
	const { selectedDatabase } = useDatabaseStore();

	const {
		mutateAsync: deleteCellsAsync,
		isPending: isDeletingCells,
		reset: resetDeleteResult,
		error: deleteCellsError,
	} = useMutation({
		mutationFn: async ({
			rowData,
			force = false,
		}: {
			rowData: Record<string, unknown>[];
			force?: boolean;
		}) => {
			if (!tableName) {
				throw new Error("No active table selected");
			}

			if (!tableCols || tableCols.length === 0) {
				throw new Error("No table columns found");
			}

			const result = await deleteCellsService(
				tableName,
				tableCols,
				rowData,
				force,
				selectedDatabase || undefined,
			);
			return result;
		},
		onSuccess: async (result: DeleteRecordResult | { deletedCount: number }) => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: tableKeys.dataByTable(tableName),
					exact: false,
				}),
				queryClient.invalidateQueries({
					queryKey: tableKeys.lists(),
				}),
			]);

			return result;
		},
	});

	const deleteCells = async (
		rowData: Record<string, unknown>[],
	): Promise<{ deletedCount: number }> => {
		const promise = deleteCellsAsync({ rowData, force: false });
		toast.promise(promise, {
			loading: "Deleting records...",
			success: (result) => `Deleted ${result.deletedCount} records from "${tableName}"`,
			error: (error: Error) => error.message || "Failed to delete records",
		});
		return promise;
	};

	const forceDeleteCells = async (
		rowData: Record<string, unknown>[],
	): Promise<{ deletedCount: number }> => {
		const promise = deleteCellsAsync({ rowData, force: true });
		toast.promise(promise, {
			loading: "Deleting records...",
			success: (result) => `Deleted ${result.deletedCount} records from "${tableName}"`,
			error: (error: Error) => error.message || "Failed to delete records",
		});
		return promise;
	};

	return {
		deleteCells,
		forceDeleteCells,
		isDeletingCells,
		resetDeleteResult,
		deleteCellsError,
	};
};

const deleteCellsService = async (
	tableName: string,
	tableCols: ColumnInfoSchemaType[],
	rowData: Record<string, unknown>[],
	force: boolean,
	database?: string,
): Promise<DeleteRecordResult | { deletedCount: number }> => {
	// Find primary key column
	const primaryKeyCol = tableCols.find((col) => col.isPrimaryKey);
	if (!primaryKeyCol) {
		throw new Error("No primary key found for this table");
	}

	// Extract primary key values from each row
	const primaryKeys = rowData.map((row) => ({
		columnName: primaryKeyCol.columnName,
		value: row[primaryKeyCol.columnName],
	}));

	const payload = {
		tableName,
		primaryKeys,
	};

	try {
		const res = await deleteRecords({
			...payload,
			force,
			db: database,
		});
		return {
			deletedCount: res.data.data.deletedCount,
			fkViolation: res.data.data.fkViolation,
			relatedRecords: res.data.data.relatedRecords,
		};
	} catch (error) {
		// For FK violations (409), we return the result with relatedRecords instead of throwing
		const axiosError = error as AxiosError<{ deletedCount: number }>;
		if (axiosError.response?.status === 409) {
			return {
				deletedCount: axiosError.response.data.deletedCount,
			};
		}
		throw error;
	}
};
