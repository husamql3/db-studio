import { ReferencedTable } from "@/components/add-table/add-record/referenced-table";
import { SheetSidebar } from "@/components/sheet-sidebar";
import { Button } from "@/components/ui/button";
import { SheetClose, SheetFooter } from "@/components/ui/sheet";
import { useSheetStore } from "@/stores/sheet.store";

export const RecordReferenceSheet = () => {
	const { closeSheet, isSheetOpen, recordReferenceData } = useSheetStore();
	if (!recordReferenceData.tableName || !recordReferenceData.referencedColumn) {
		return null;
	}

	return (
		<SheetSidebar
			open={isSheetOpen("record-reference")}
			onOpenChange={(open) => {
				if (!open) {
					closeSheet("record-reference");
				}
			}}
			title={`View records in the table ${recordReferenceData.tableName}`}
		>
			<ReferencedTable
				tableName={recordReferenceData.tableName}
				referencedColumn={recordReferenceData.referencedColumn ?? null}
				columnName={recordReferenceData.columnName ?? ""}
			/>

			<SheetFooter>
				<SheetClose
					asChild
					// onClick={handleCancel}
					// disabled={isCreatingRecord}
				>
					<Button
						variant="outline"
						size="sm"
					>
						Close
					</Button>
				</SheetClose>
			</SheetFooter>
		</SheetSidebar>
	);
};
