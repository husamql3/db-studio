import { createContext, useContext } from "react";

type SearchParamsContextValue = {
	activeTable: string | null;
	tables: string[];
};

export const SearchParamsContext = createContext<SearchParamsContextValue | undefined>(undefined);

export const useSearchParams = () => {
	const context = useContext(SearchParamsContext);
	if (context === undefined) {
		throw new Error("useSearchParams must be used within a SearchParamsProvider");
	}
	return context;
};
