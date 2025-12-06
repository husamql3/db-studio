import { ReferencedTable } from "@/components/table-tab/add-table/add-record/referenced-table";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useSheetStore } from "@/stores/sheet.store";

export const RecordReferenceSheet = () => {
	const { closeSheet, isSheetOpen, recordReferenceData } = useSheetStore();
	if (!recordReferenceData.tableName || !recordReferenceData.referencedColumn) {
		return null;
	}

	return (
		<Sheet
			open={isSheetOpen("record-reference")}
			onOpenChange={(open) => {
				if (!open) {
					closeSheet("record-reference");
				}
			}}
		>
			<SheetContent className="sm:max-w-xl!">
				<SheetHeader>
					<SheetTitle>
						View records in the table{" "}
						<span className="text-primary">{recordReferenceData.tableName}</span>
					</SheetTitle>
					<SheetDescription className="sr-only">
						View records in the table: {recordReferenceData.tableName}.
					</SheetDescription>
				</SheetHeader>

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
			</SheetContent>
		</Sheet>
	);
};
