import { useActiveTableStore } from "@/stores/active-table.store";
import { AddRecordForm } from "./add-table/add-record/add-record-form.tsx";
import { TableView } from "./table-view";

export const TableTab = () => {
	const { activeTable } = useActiveTableStore();
	if (!activeTable) {
		return (
			<main className="flex-1 flex items-center justify-center">
				Select a table to view
			</main>
		);
	}

	return (
		<div className="flex flex-col flex-1 h-full overflow-hidden">
			<TableView key={activeTable} />

			{/* sheets components */}
			<AddRecordForm />
		</div>
	);
};
