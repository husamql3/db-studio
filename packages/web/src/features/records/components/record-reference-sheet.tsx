import type { FilterType } from "@db-studio/shared/types";
import { parseAsJson, useQueryState } from "nuqs";
import { SheetSidebar } from "@/components/sheet-sidebar";
import { useOverlayStore } from "@/stores/overlay.store";
import { CONSTANTS } from "@/utils/constants";
import { useRecordReferenceStore } from "../stores/record-reference.store";
import { ReferencedTable } from "./referenced-table";

export const RecordReferenceSheet = () => {
	const { closeOverlay, isOverlayOpen } = useOverlayStore();
	const { tableName, referencedColumn, columnName, clearRecordReference } =
		useRecordReferenceStore();

	const [, setReferencedActiveTable] = useQueryState(
		CONSTANTS.REFERENCED_TABLE_STATE_KEYS.ACTIVE_TABLE,
	);
	const [, setRCursor] = useQueryState(CONSTANTS.REFERENCED_TABLE_STATE_KEYS.CURSOR);
	const [, setRDirection] = useQueryState(CONSTANTS.REFERENCED_TABLE_STATE_KEYS.DIRECTION);
	const [, setRLimit] = useQueryState(CONSTANTS.REFERENCED_TABLE_STATE_KEYS.LIMIT.toString());
	const [, setRSort] = useQueryState(CONSTANTS.REFERENCED_TABLE_STATE_KEYS.SORT.toString());
	const [, setROrder] = useQueryState(CONSTANTS.REFERENCED_TABLE_STATE_KEYS.ORDER.toString());
	const [, setRFilters] = useQueryState<FilterType[]>(
		CONSTANTS.REFERENCED_TABLE_STATE_KEYS.FILTERS,
		parseAsJson((value) => value as FilterType[])
			.withDefault([])
			.withOptions({ history: "push" }),
	);

	if (!tableName || !referencedColumn) {
		return null;
	}

	const handleClose = () => {
		closeOverlay("records.record-reference");
		clearRecordReference();
		setReferencedActiveTable(null);
		setRCursor(null);
		setRDirection(null);
		setRLimit(null);
		setRSort(null);
		setROrder(null);
		setRFilters(null);
	};

	return (
		<SheetSidebar
			title={`View records in the table ${tableName}`}
			size="max-w-lg!"
			contentClassName="p-0"
			open={isOverlayOpen("records.record-reference")}
			onOpenChange={(open) => {
				if (!open) {
					handleClose();
				}
			}}
		>
			<ReferencedTable
				tableName={tableName}
				referencedColumn={referencedColumn}
				columnName={columnName ?? ""}
			/>
		</SheetSidebar>
	);
};
