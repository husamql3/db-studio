import { useMemo } from "react";
import { SidebarListItem } from "@/components/sidebar/sidebar-list-item";
import { useTablesList } from "@/hooks/use-tables-list";

// todo: add loader skeleton

export const TablesList = ({ searchTerm }: { searchTerm: string }) => {
	const { tablesList, isLoadingTables } = useTablesList();

	const filteredTables = useMemo(() => {
		if (!tablesList) return [];
		if (!searchTerm.trim()) return tablesList;

		const lowerSearchTerm = searchTerm.toLowerCase();
		return tablesList.filter((table) => table.tableName.toLowerCase().includes(lowerSearchTerm));
	}, [tablesList, searchTerm]);

	return (
		<div className="flex-1 overflow-y-auto">
			{isLoadingTables ? (
				<div className="px-4 py-8 text-center text-sm text-zinc-500">Loading tables...</div>
			) : filteredTables.length > 0 ? (
				<ul>
					{filteredTables.map((table) => (
						<SidebarListItem key={table.tableName} tableName={table.tableName} rowCount={table.rowCount} />
					))}
				</ul>
			) : searchTerm ? (
				<div className="px-4 py-8 text-center text-sm text-zinc-500">No tables found matching</div>
			) : (
				<div className="px-4 py-8 text-center text-sm text-zinc-500">No tables available</div>
			)}
		</div>
	);
};
