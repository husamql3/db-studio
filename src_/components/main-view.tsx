"use client";

import { useSearchParams } from "../hooks/use-search-params";
import { TableContent } from "./table-content";

export const MainView = () => {
	const { activeTable } = useSearchParams();

	if (!activeTable) {
		return (
			<main className="flex-1 flex items-center justify-center">
				<div className="text-zinc-400">Select a table to view</div>
			</main>
		);
	}

	return <TableContent key={activeTable} activeTable={activeTable} />;
};
