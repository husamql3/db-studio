import type { FilterType } from "@db-studio/shared/types";
import { parseAsJson, useQueryState } from "nuqs";
import type { TablePageParams } from "@/hooks/use-table-data";
import { CONSTANTS } from "@/utils/constants";

export const tableFiltersParser = parseAsJson((value) => value as FilterType[])
	.withDefault([])
	.withOptions({ history: "push" });

/** The page the main grid shows, read from the URL. */
export const useGridPage = (tableName: string, schemaName: string | undefined) => {
	const [cursor] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.CURSOR);
	const [limit] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.LIMIT);
	const [direction] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.DIRECTION);
	const [sort] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.SORT);
	const [order] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.ORDER);
	const [filters] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.FILTERS, tableFiltersParser);

	return {
		tableName,
		schemaName,
		cursor,
		limit,
		direction,
		sort,
		order,
		filters,
	} satisfies TablePageParams;
};
