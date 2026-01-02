import { parseAsJson, parseAsString, useQueryStates } from "nuqs";
import type { Filter, Sort } from "server/src/dao/tables-data.dao";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CONSTANTS, TABS } from "@/utils/constants";

export const Tabs = () => {
	const [{ activeTab }, setAllStates] = useQueryStates(
		{
			activeTab: parseAsString,
			sort: parseAsString,
			order: parseAsString,
			page: parseAsString,
			limit: parseAsString,
			filters: parseAsJson<Filter[]>((value) => value as Filter[])
				.withDefault([])
				.withOptions({ history: "push" }),
			columnName: parseAsString,
			referencedActiveTable: parseAsString,
			referencedPage: parseAsString,
			referencedLimit: parseAsString,
			referencedFilters: parseAsJson<Filter[]>((value) => value as Filter[])
				.withDefault([])
				.withOptions({ history: "push" }),
			referencedSort: parseAsJson<Sort[]>((value) => value as Sort[])
				.withDefault([])
				.withOptions({ history: "push" }),
			referencedOrder: parseAsString,
		},
		{
			history: "push",
			urlKeys: {
				activeTab: CONSTANTS.ACTIVE_TAB,
				sort: CONSTANTS.TABLE_STATE_KEYS.SORT,
				order: CONSTANTS.TABLE_STATE_KEYS.ORDER,
				page: CONSTANTS.TABLE_STATE_KEYS.PAGE,
				limit: CONSTANTS.TABLE_STATE_KEYS.LIMIT,
				filters: CONSTANTS.TABLE_STATE_KEYS.FILTERS,
				columnName: CONSTANTS.COLUMN_NAME,
				referencedActiveTable: CONSTANTS.REFERENCED_TABLE_STATE_KEYS.ACTIVE_TABLE,
				referencedPage: CONSTANTS.REFERENCED_TABLE_STATE_KEYS.PAGE,
				referencedLimit: CONSTANTS.REFERENCED_TABLE_STATE_KEYS.LIMIT,
				referencedFilters: CONSTANTS.REFERENCED_TABLE_STATE_KEYS.FILTERS,
				referencedSort: CONSTANTS.REFERENCED_TABLE_STATE_KEYS.SORT,
				referencedOrder: CONSTANTS.REFERENCED_TABLE_STATE_KEYS.ORDER,
			},
		},
	);

	const handleChangeTab = (tabId: string) => {
		// Reset all states and set the new active tab
		setAllStates({
			activeTab: tabId.toLowerCase(),
			sort: null,
			order: null,
			page: null,
			limit: null,
			filters: null,
			columnName: null,
			referencedActiveTable: null,
			referencedPage: null,
			referencedLimit: null,
			referencedFilters: null,
			referencedSort: null,
			referencedOrder: null,
		});
	};

	return (
		<div className="flex h-full items-center">
			{TABS.map(({ id, label }) => (
				<Button
					key={id}
					variant="ghost"
					onClick={() => handleChangeTab(id)}
					className={cn(
						"flex-1 px-4 border-l-0 border-y-0 border-r border-zinc-800 h-full rounded-none",
						activeTab === id ? "bg-zinc-900 text-white" : "text-zinc-400",
					)}
				>
					{label}
				</Button>
			))}
		</div>
	);
};
