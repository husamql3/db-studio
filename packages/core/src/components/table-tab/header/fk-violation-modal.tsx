import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { DeleteResult } from "@/hooks/use-delete-cells";
import { RelatedRecordsView } from "./related-records-modal";

export const FkViolationModal = ({
	showFkDialog,
	handleDialogClose,
	deleteResult,
}: {
	showFkDialog: boolean;
	handleDialogClose: () => void;
	deleteResult: DeleteResult;
}) => {
	const handleForceDelete = useCallback(async () => {
		if (deleteResult.relatedRecords.length === 0) return;

		// Store the data before closing dialog
		const dataToDelete = [...pendingRowData];

		// Then perform the delete
		await forceDeleteCells(dataToDelete);

		// Close dialog and reset state first
		handleDialogClose();
		setPendingRowData([]);
		resetDeleteResult();
	}, [handleDialogClose, deleteResult.relatedRecords]);

	return (
		<Dialog
			open={showFkDialog}
			onOpenChange={(open) => {
				if (!open) handleDialogClose();
			}}
		>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>Cannot Delete - Foreign Key Constraint</DialogTitle>
					<DialogDescription>
						The selected records cannot be deleted because they are referenced by records
						in other tables. You can either cancel the operation or force delete, which
						will also delete all related records.
					</DialogDescription>
				</DialogHeader>

				{deleteResult?.relatedRecords && (
					<RelatedRecordsView relatedRecords={deleteResult.relatedRecords} />
				)}

				<DialogFooter className="gap-2">
					<Button
						variant="outline"
						onClick={handleDialogClose}
						// disabled={isDeletingCells}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={handleForceDelete}
						// disabled={isDeletingCells}
					>
						Force Delete All
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
