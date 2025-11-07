import { TableHeader } from "@/components/table-grid/header/table-header";
import { useActiveTableStore } from "@/stores/active-table.store";

export const TableTab = () => {
	const { activeTable } = useActiveTableStore();
	if (!activeTable) {
		return <main className="flex-1 flex items-center justify-center">Select a table to view</main>;
	}

	return (
		<div className="flex flex-col flex-1 h-full overflow-hidden">
			<TableHeader />

			<main className="flex-1 overflow-auto">{activeTable}</main>
		</div>
	);
};
