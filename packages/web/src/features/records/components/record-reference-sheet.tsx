import { SheetSidebar } from "@/components/sheet-sidebar";
import { useOverlayStore } from "@/stores/overlay.store";
import { useRecordReferenceStore } from "../stores/record-reference.store";
import { ReferencedTable } from "./referenced-table";

export const RecordReferenceSheet = () => {
	const { closeOverlay, isOverlayOpen } = useOverlayStore();
	const { reference, clearRecordReference } = useRecordReferenceStore();

	if (!reference) {
		return null;
	}

	return (
		<SheetSidebar
			title={`View records in the table ${reference.tableName}`}
			size="max-w-lg!"
			contentClassName="p-0"
			open={isOverlayOpen("records.record-reference")}
			onOpenChange={(open) => {
				if (!open) {
					closeOverlay("records.record-reference");
					clearRecordReference();
				}
			}}
		>
			<ReferencedTable {...reference} />
		</SheetSidebar>
	);
};
