import { useActiveTableStore } from "@/store/active-table.store";
import { TableHeader } from "./header/table-header";
import { Table } from "./table-grid/table";

export const TableTab = () => {
	const { activeTable } = useActiveTableStore();

	if (!activeTable) {
		return <main className="flex-1 flex items-center justify-center">Select a table to view</main>;
	}

	return (
		<div className="flex flex-col flex-1 h-full overflow-hidden">
			<TableHeader />

			<main className="flex-1 overflow-auto">
				<Table />
			</main>
		</div>
	);
};
