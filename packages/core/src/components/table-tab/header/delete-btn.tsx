import type { OnChangeFn, Row, RowSelectionState } from "@tanstack/react-table";
import { useCallback, useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { type RelatedRecord, useDeleteCells } from "@/hooks/use-delete-cell";
import type { TableRecord } from "@/types/table.type";
import { ForceDeleteDialog } from "./force-delete-dialog";

export const DeleteBtn = ({
	selectedRows,
	setRowSelection,
	tableName,
}: {
	tableName: string;
	selectedRows: Row<TableRecord>[];
	setRowSelection: OnChangeFn<RowSelectionState>;
}) => {
	const { deleteCells, forceDeleteCells, isDeletingCells, resetDeleteResult } = useDeleteCells(
		{ tableName },
	);
	const [pendingRowData, setPendingRowData] = useState<Record<string, unknown>[]>([]);
	const [isOpenFkDialog, setIsOpenFkDialog] = useState(false);
	const [isOpenConfirmDialog, setIsOpenConfirmDialog] = useState(false);
	const [relatedRecords, setRelatedRecords] = useState<RelatedRecord[]>([]);

	const handleDeleteClick = useCallback(() => {
		setIsOpenConfirmDialog(true);
	}, []);

	const handleConfirmDelete = useCallback(async () => {
		const rowData = selectedRows.map((row) => row.original);
		let relatedRecords: RelatedRecord[] | undefined;

		setIsOpenConfirmDialog(false);

		try {
			await deleteCells(rowData);
			setRowSelection({});
		} catch {
			setPendingRowData(rowData);
			setRelatedRecords(relatedRecords || []);
			setIsOpenFkDialog(true);
		}
	}, [deleteCells, selectedRows, setRowSelection]);

	const handleForceDelete = async () => {
		if (pendingRowData.length === 0) return;

		const res = await forceDeleteCells(pendingRowData);
		console.log("Force delete response:", res);

		// Only close dialog after successful deletion
		if (res?.deletedCount > 0) {
			setIsOpenFkDialog(false);
			setPendingRowData([]);
			setRelatedRecords([]);
			resetDeleteResult();
			// Reset row selection after successful force deletion
			setRowSelection({});
		}
	};

	const handleCancelForceDelete = useCallback(() => {
		setIsOpenFkDialog(false);
		setPendingRowData([]);
		setRelatedRecords([]);
		resetDeleteResult();
	}, [resetDeleteResult]);

	const handleDialogClose = (isOpen: boolean) => {
		// Only allow closing if not currently deleting
		if (isDeletingCells) return;

		if (!isOpen) {
			handleCancelForceDelete();
		} else {
			setIsOpenFkDialog(isOpen);
		}
	};

	if (selectedRows?.length === 0) {
		return null;
	}

	return (
		<>
			<Button
				type="button"
				variant="destructive"
				className="h-8! border-l-0 border-y-0 border-r border-zinc-800 text-white rounded-none"
				onClick={handleDeleteClick}
				aria-label="Delete the selected record"
				disabled={isDeletingCells}
			>
				Delete Record
				{selectedRows?.length > 1 && (
					<span className="ml-1.5 px-1.5 text-[10px] bg-white/20 border border-white/20 rounded">
						{selectedRows?.length}
					</span>
				)}
			</Button>

			<AlertDialog
				open={isOpenConfirmDialog}
				onOpenChange={setIsOpenConfirmDialog}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Delete {selectedRows.length === 1 ? "Record" : "Records"}
						</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete{" "}
							{selectedRows.length === 1 ? "this record" : `${selectedRows.length} records`}{" "}
							from "{tableName}"? This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={handleConfirmDelete}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<ForceDeleteDialog
				isOpenFkDialog={isOpenFkDialog}
				handleDialogClose={handleDialogClose}
				relatedRecords={relatedRecords}
				handleCancelForceDelete={handleCancelForceDelete}
				handleForceDelete={handleForceDelete}
				isDeletingCells={isDeletingCells}
			/>
		</>
	);
};
