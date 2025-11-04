import { useActiveTableStore } from "@/store/active-table.store";
import { Header } from "./header";

export const TableTab = () => {
	const { activeTable } = useActiveTableStore();

	if (!activeTable) {
		return (
			<div className="flex flex-col h-full">
				<Header />
				<main className="flex-1 flex items-center justify-center">Select a table to view</main>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			<Header />
			<main className="flex-1 flex items-center justify-center">
				<h1>{activeTable}</h1>
			</main>
		</div>
	);
};
