import type { AlterColumnSchemaType, ColumnInfoSchemaType } from "@db-studio/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { alterColumn, renameColumn } from "@/shared/api";
import { tableKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";

type MutationError = Error & {
	details?: unknown;
};

export type ColumnChange = {
	columnName: string;
	alter?: AlterColumnSchemaType;
	newColumnName?: string;
};

export const planColumnChanges = (
	tableCols: ColumnInfoSchemaType[],
	values: { fields: { columnName: string; columnType: string }[] },
): ColumnChange[] =>
	tableCols.flatMap((col, i) => {
		const value = values.fields[i];
		if (!value) return [];
		const alter =
			value.columnType !== col.dataTypeLabel
				? {
						columnType: value.columnType,
						isNullable: col.isNullable,
						defaultValue: col.columnDefault,
					}
				: undefined;
		const trimmedName = value.columnName.trim();
		const newColumnName = trimmedName !== col.columnName ? trimmedName : undefined;
		return alter || newColumnName !== undefined
			? [{ columnName: col.columnName, alter, newColumnName }]
			: [];
	});

export const useEditTable = ({ tableName }: { tableName: string }) => {
	const queryClient = useQueryClient();
	const { selectedDatabase } = useDatabaseStore();

	const { mutateAsync: editTableMutation, isPending: isEditingTable } = useMutation<
		number,
		MutationError,
		ColumnChange[]
	>({
		mutationFn: async (changes) => {
			for (const { columnName, alter, newColumnName } of changes) {
				if (alter) {
					await alterColumn({ tableName, columnName, data: alter, db: selectedDatabase });
				}
				if (newColumnName !== undefined) {
					await renameColumn({
						tableName,
						columnName,
						data: { newColumnName },
						db: selectedDatabase,
					});
				}
			}
			return changes.length;
		},
		// Earlier columns may have applied before a failure, so refresh either way.
		onSettled: async () => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: tableKeys.columnsByTable(tableName),
					exact: false,
				}),
				queryClient.invalidateQueries({
					queryKey: tableKeys.dataByTable(tableName),
					exact: false,
				}),
			]);
		},
	});

	const editTable = (changes: ColumnChange[]) =>
		toast
			.promise(editTableMutation(changes), {
				loading: "Saving table changes...",
				success: (count) => `Updated ${count} ${count === 1 ? "column" : "columns"}`,
				error: (error: MutationError) =>
					(typeof error.details === "string" && error.details) ||
					error.message ||
					"Failed to update table",
			})
			.unwrap();

	return {
		editTable,
		isEditingTable,
	};
};
