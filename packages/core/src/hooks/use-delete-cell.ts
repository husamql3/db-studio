import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import type { BaseResponse, ColumnInfoSchemaType, DeleteRecordResult } from "shared/types";
import { toast } from "sonner";
import { useTableCols } from "@/hooks/use-table-cols";
import { api } from "@/lib/api";
import { useDatabaseStore } from "@/stores/database.store";
import { CONSTANTS } from "@/utils/constants";

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
			console.log("result", result);
			// Only show success toast and clear selection if actually deleted
			toast.success(`Deleted ${result.deletedCount} records from "${tableName}"`);

			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: [CONSTANTS.CACHE_KEYS.TABLE_DATA, tableName],
					exact: false,
				}),
				queryClient.invalidateQueries({
					queryKey: [CONSTANTS.CACHE_KEYS.TABLES_LIST],
				}),
			]);
		},
		onError: (error) => {
			console.error("Delete error:", error);
			if (error instanceof AxiosError && error.status === 409) {
				toast.error(
					`Cannot delete records from "${tableName}" due to foreign key constraints, on ${error.response?.data.relatedRecords.map((r: RelatedRecord) => r.tableName).join(", ")}`,
				);
			} else {
				toast.error(error instanceof Error ? error.message : "Unknown error occurred");
			}
		},
	});

	const deleteCells = async (
		rowData: Record<string, unknown>[],
	): Promise<{ deletedCount: number }> => {
		return deleteCellsAsync({ rowData, force: false });
	};

	const forceDeleteCells = async (
		rowData: Record<string, unknown>[],
	): Promise<{ deletedCount: number }> => {
		return deleteCellsAsync({ rowData, force: true });
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
	const endpoint = force ? "/records/force" : "/records";

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
		const res = await api.delete<BaseResponse<DeleteRecordResult>>(endpoint, {
			data: payload,
			params: { db: database },
		});
		return {
			deletedCount: res.data.data.deletedCount,
			fkViolation: res.data.data.fkViolation,
			relatedRecords: res.data.data.relatedRecords,
		};
	} catch (error) {
		// For FK violations (409), we return the result with relatedRecords instead of throwing
		const axiosError = error as AxiosError<{ deletedCount: number }>;
		console.log("axiosError", axiosError);
		if (axiosError.response?.status === 409) {
			return {
				deletedCount: axiosError.response.data.deletedCount,
			};
		}
		throw error;
	}
};
