import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTableCols } from "@/features/schema";
import { Route } from "@/routes/_pathlessLayout/table/$table";
import { updateRecords } from "@/shared/api";
import { tableKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";
import { type CellUpdate, useUpdateCellStore } from "../stores/update-cell.store";
import { getIdentityColumnNames } from "../utils/row-details-utils";

export const useUpdateCell = () => {
	const queryClient = useQueryClient();
	const { table } = Route.useParams();
	const { clearUpdates, getUpdateCount } = useUpdateCellStore();
	const { selectedDatabase } = useDatabaseStore();
	const { tableCols } = useTableCols({ tableName: table });

	const { mutateAsync: updateCellMutation, isPending: isUpdatingCell } = useMutation({
		mutationFn: async (updates: CellUpdate[]) => {
			if (!table) {
				throw new Error("No table selected");
			}

			// Transform updates into the format the API expects. Composite keys are
			// sent in full so an edit can never match more than its own record.
			const identityColumnNames = getIdentityColumnNames(tableCols);
			const payload = {
				tableName: table,
				updates: updates.map((update) => ({
					rowData: update.rowData,
					columnName: update.columnName,
					value: update.newValue,
				})),
				...(identityColumnNames.length > 0
					? { primaryKey: identityColumnNames[0], primaryKeys: identityColumnNames }
					: {}),
			};

			const res = await updateRecords({ ...payload, db: selectedDatabase });
			return res.data.data;
		},
		onSuccess: async () => {
			clearUpdates();

			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: tableKeys.dataByTable(table),
					exact: false,
				}),
			]);
		},
	});

	const updateCell = async (updates: CellUpdate[]) => {
		const count = getUpdateCount();
		return toast.promise(updateCellMutation(updates), {
			loading: "Saving changes...",
			success: (message) =>
				message || `${count} ${count === 1 ? "change" : "changes"} saved successfully`,
			error: (error: Error) => error.message || "Failed to save changes",
		});
	};

	return {
		updateCell,
		isUpdatingCell: isUpdatingCell,
	};
};
