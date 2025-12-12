import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { type RelatedRecord, useDeleteCells } from "@/hooks/use-delete-cells";
import { useTableData } from "@/hooks/use-table-data";
import { useActiveTableStore } from "@/stores/active-table.store";

const RelatedRecordsView = ({ relatedRecords }: { relatedRecords: RelatedRecord[] }) => {
	return (
		<div className="space-y-4 max-h-64 overflow-y-auto">
			{relatedRecords.map((related, idx) => (
				<div
					key={`${related.tableName}-${related.columnName}-${idx}`}
					className="border border-zinc-700 rounded-md p-3"
				>
					<div className="font-medium text-sm mb-2">
						Table: <span className="text-primary">{related.tableName}</span>
						<span className="text-muted-foreground ml-2">
							({related.records.length} record{related.records.length !== 1 ? "s" : ""})
						</span>
					</div>
					<div className="text-xs text-muted-foreground mb-2">
						References column: {related.columnName}
					</div>
					<div className="bg-zinc-900 rounded p-2 text-xs overflow-x-auto">
						<pre className="whitespace-pre-wrap">
							{JSON.stringify(related.records.slice(0, 5), null, 2)}
							{related.records.length > 5 && (
								<div className="text-muted-foreground mt-2">
									... and {related.records.length - 5} more
								</div>
							)}
						</pre>
					</div>
				</div>
			))}
		</div>
	);
};

export const DeleteBtn = () => {
	const { activeTable, selectedRowIndices } = useActiveTableStore();
	const { tableData } = useTableData(activeTable);
	const {
		deleteCells,
		forceDeleteCells,
		isDeletingCells,
		deleteResult,
		resetDeleteResult,
	} = useDeleteCells();

	const [showFkDialog, setShowFkDialog] = useState(false);
	const [pendingRowData, setPendingRowData] = useState<Record<string, unknown>[]>([]);

	// Get the actual row data for selected indices
	const getSelectedRowData = useCallback((): Record<string, unknown>[] => {
		if (!tableData?.data) return [];
		return selectedRowIndices
			.map((index) => tableData.data[index])
			.filter((row): row is Record<string, unknown> => row !== undefined);
	}, [tableData?.data, selectedRowIndices]);

	const handleDelete = useCallback(async () => {
		const rowData = getSelectedRowData();
		if (rowData.length === 0) return;

		const result = await deleteCells(rowData);

		// If FK violation, show the dialog
		if (result.fkViolation && result.relatedRecords) {
			setPendingRowData(rowData);
			setShowFkDialog(true);
		}
	}, [getSelectedRowData, deleteCells]);

	const handleForceDelete = useCallback(async () => {
		if (pendingRowData.length === 0) return;

		await forceDeleteCells(pendingRowData);
		// setShowFkDialog(false);
		setPendingRowData([]);
		resetDeleteResult();
	}, [pendingRowData, forceDeleteCells, resetDeleteResult]);

	const handleCancelForceDelete = useCallback(() => {
		setShowFkDialog(false);
		setPendingRowData([]);
		resetDeleteResult();
	}, [resetDeleteResult]);

	if (selectedRowIndices.length === 0) {
		return null;
	}

	return (
		<>
			<Button
				type="button"
				variant="destructive"
				size="sm"
				className="rounded-none text-xs h-9! border-r border-zinc-800 flex items-center justify-center font-medium transition-colors"
				onClick={handleDelete}
				disabled={isDeletingCells}
				data-grid-action
			>
				{isDeletingCells ? "Deleting..." : "Delete"}
				{selectedRowIndices.length > 0 && (
					<span className="px-1.5 py-0.5 text-[10px] bg-white/20 rounded">
						{selectedRowIndices.length}
					</span>
				)}
			</Button>

			{/* FK Violation Dialog */}
			<Dialog
				open={showFkDialog}
				onOpenChange={(open) => {
					if (!open) handleCancelForceDelete();
				}}
			>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>Cannot Delete - Foreign Key Constraint</DialogTitle>
						<DialogDescription>
							The selected records cannot be deleted because they are referenced by
							records in other tables. You can either cancel the operation or force
							delete, which will also delete all related records.
						</DialogDescription>
					</DialogHeader>

					{deleteResult?.relatedRecords && (
						<RelatedRecordsView relatedRecords={deleteResult.relatedRecords} />
					)}

					<DialogFooter className="gap-2">
						<Button
							variant="outline"
							onClick={handleCancelForceDelete}
							disabled={isDeletingCells}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={handleForceDelete}
							disabled={isDeletingCells}
						>
							{isDeletingCells ? "Deleting..." : "Force Delete All"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
};
