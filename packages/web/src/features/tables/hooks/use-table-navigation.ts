import { useQueryState } from "nuqs";
import { useCallback } from "react";
import { CONSTANTS } from "@/utils/constants";

export function useTableNavigation() {
	const [, setActiveTable] = useQueryState(CONSTANTS.ACTIVE_TABLE);
	const [, setActiveTab] = useQueryState(CONSTANTS.ACTIVE_TAB);
	const [, setOrder] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.ORDER);
	const [, setSort] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.SORT);
	const [, setFilters] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.FILTERS);
	const [, setCursor] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.CURSOR);
	const [, setDirection] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.DIRECTION);
	const [, setColumnName] = useQueryState(CONSTANTS.COLUMN_NAME);
	const [, setReferencedActiveTable] = useQueryState(
		CONSTANTS.REFERENCED_TABLE_STATE_KEYS.ACTIVE_TABLE,
	);
	const [, setReferencedCursor] = useQueryState(CONSTANTS.REFERENCED_TABLE_STATE_KEYS.CURSOR);
	const [, setReferencedDirection] = useQueryState(
		CONSTANTS.REFERENCED_TABLE_STATE_KEYS.DIRECTION,
	);
	const [, setReferencedLimit] = useQueryState(
		CONSTANTS.REFERENCED_TABLE_STATE_KEYS.LIMIT.toString(),
	);
	const [, setReferencedSort] = useQueryState(
		CONSTANTS.REFERENCED_TABLE_STATE_KEYS.SORT.toString(),
	);
	const [, setReferencedOrder] = useQueryState(
		CONSTANTS.REFERENCED_TABLE_STATE_KEYS.ORDER.toString(),
	);
	const [, setReferencedFilters] = useQueryState(
		CONSTANTS.REFERENCED_TABLE_STATE_KEYS.FILTERS,
	);

	const navigateToTable = useCallback(
		(tableName: string) => {
			setActiveTab("table");
			setActiveTable(tableName);
			setOrder(null);
			setSort(null);
			setFilters(null);
			setCursor(null);
			setDirection(null);
			setColumnName(null);
			setReferencedActiveTable(null);
			setReferencedCursor(null);
			setReferencedDirection(null);
			setReferencedLimit(null);
			setReferencedSort(null);
			setReferencedOrder(null);
			setReferencedFilters(null);
		},
		[
			/* deps */
		],
	);

	return { navigateToTable };
}
