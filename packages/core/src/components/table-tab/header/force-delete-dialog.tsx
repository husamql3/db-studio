import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { RelatedRecord } from "@/hooks/use-delete-cell";

export const ForceDeleteDialog = ({
	isOpenFkDialog,
	handleDialogClose,
	relatedRecords,
	handleCancelForceDelete,
	handleForceDelete,
	isDeletingCells,
}: {
	isOpenFkDialog: boolean;
	handleDialogClose: (isOpen: boolean) => void;
	relatedRecords: RelatedRecord[];
	handleCancelForceDelete: () => void;
	handleForceDelete: () => void;
	isDeletingCells: boolean;
}) => {
	return (
		<Dialog
			open={isOpenFkDialog}
			onOpenChange={handleDialogClose}
		>
			<DialogContent className="max-w-2xl z-500">
				<DialogHeader>
					<DialogTitle>Cannot Delete - Foreign Key Constraint</DialogTitle>
					<DialogDescription>
						The selected records cannot be deleted because they are referenced by records in
						other tables. You can either cancel the operation or force delete, which will also
						delete all related records.
					</DialogDescription>
				</DialogHeader>

				<RelatedRecordsView relatedRecords={relatedRecords} />

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
	);
};

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
							({related.records.length} record
							{related.records.length !== 1 ? "s" : ""})
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
