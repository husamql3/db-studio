import { parseAsJson, useQueryState } from "nuqs";
import type { FilterType } from "shared/types";
import { ReferencedTable } from "@/components/add-table/add-record/referenced-table";
import { SheetSidebar } from "@/components/sheet-sidebar";
import { useSheetStore } from "@/stores/sheet.store";
import { CONSTANTS } from "@/utils/constants";

export const RecordReferenceSheet = () => {
	const [, setReferencedActiveTable] = useQueryState(
		CONSTANTS.REFERENCED_TABLE_STATE_KEYS.ACTIVE_TABLE,
	);
	const [, setRCursor] = useQueryState(
		CONSTANTS.REFERENCED_TABLE_STATE_KEYS.CURSOR,
	);
	const [, setRDirection] = useQueryState(
		CONSTANTS.REFERENCED_TABLE_STATE_KEYS.DIRECTION,
	);
	const [, setRLimit] = useQueryState(
		CONSTANTS.REFERENCED_TABLE_STATE_KEYS.LIMIT.toString(),
	);
	const [, setRSort] = useQueryState(
		CONSTANTS.REFERENCED_TABLE_STATE_KEYS.SORT.toString(),
	);
	const [, setROrder] = useQueryState(
		CONSTANTS.REFERENCED_TABLE_STATE_KEYS.ORDER.toString(),
	);
	const [, setRFilters] = useQueryState<FilterType[]>(
		CONSTANTS.REFERENCED_TABLE_STATE_KEYS.FILTERS,
		parseAsJson((value) => value as FilterType[])
			.withDefault([])
			.withOptions({ history: "push" }),
	);

	const { closeSheet, isSheetOpen, recordReferenceData } = useSheetStore();
	if (!recordReferenceData.tableName || !recordReferenceData.referencedColumn) {
		return null;
	}

	return (
		<SheetSidebar
			title={`View records in the table ${recordReferenceData.tableName}`}
			size="max-w-lg!"
			contentClassName="p-0"
			open={isSheetOpen("record-reference")}
			onOpenChange={(open) => {
				if (!open) {
					closeSheet("record-reference");
					setReferencedActiveTable(null);
					setRCursor(null);
					setRDirection(null);
					setRLimit(null);
					setRSort(null);
					setROrder(null);
					setRFilters(null);
				}
			}}
		>
			<ReferencedTable
				tableName={recordReferenceData.tableName}
				referencedColumn={recordReferenceData.referencedColumn ?? null}
				columnName={recordReferenceData.columnName ?? ""}
			/>
		</SheetSidebar>
	);
};
