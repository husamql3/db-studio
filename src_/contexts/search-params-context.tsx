import { type ReactNode, useEffect, useMemo, useState } from "react";
import { SearchParamsContext } from "../hooks/use-search-params";
import { CONSTANTS } from "../utils/constants";
import { getSearchParam } from "../utils/search-params";

export const SearchParamsProvider = ({ children }: { children: ReactNode }) => {
	const [activeTable, setActiveTable] = useState<string | null>(() => getSearchParam(CONSTANTS.ACTIVE_TABLE));
	const [tables, setTables] = useState<string[]>(
		() => getSearchParam(CONSTANTS.TABLES)?.split(",").filter(Boolean) || [],
	);

	useEffect(() => {
		const updateActiveTable = () => {
			const newValue = getSearchParam(CONSTANTS.ACTIVE_TABLE);
			// Only update if value actually changed (prevents unnecessary re-renders)
			setActiveTable((prev) => (prev !== newValue ? newValue : prev));
		};

		const updateTables = () => {
			const newValue = getSearchParam(CONSTANTS.TABLES)?.split(",").filter(Boolean) || [];
			// Only update if value actually changed (prevents unnecessary re-renders)
			setTables((prev) => {
				const hasChanged = prev.length !== newValue.length || prev.some((table, idx) => table !== newValue[idx]);
				return hasChanged ? newValue : prev;
			});
		};

		// Listen to both browser navigation and custom search param changes
		window.addEventListener("popstate", updateActiveTable);
		window.addEventListener("searchParamsChanged", updateActiveTable);
		window.addEventListener("popstate", updateTables);
		window.addEventListener("searchParamsChanged", updateTables);

		return () => {
			window.removeEventListener("popstate", updateActiveTable);
			window.removeEventListener("searchParamsChanged", updateActiveTable);
			window.removeEventListener("popstate", updateTables);
			window.removeEventListener("searchParamsChanged", updateTables);
		};
	}, []);

	// Memoize context value to prevent unnecessary re-renders of consumers
	const value = useMemo(
		() => ({
			activeTable,
			tables,
		}),
		[activeTable, tables],
	);

	return <SearchParamsContext.Provider value={value}>{children}</SearchParamsContext.Provider>;
};
