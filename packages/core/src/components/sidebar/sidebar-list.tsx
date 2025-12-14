import { useQueryState } from "nuqs";
import { useTablesList } from "@/hooks/use-tables-list";
import { CONSTANTS } from "@/utils/constants";
import { Spinner } from "../ui/spinner";
import { SidebarListItem } from "./sidebar-list-item";

export const SidebarList = () => {
	const [searchTerm] = useQueryState(CONSTANTS.SIDEBAR_TABLE_SEARCH, {
		shallow: true,
		defaultValue: "",
	});

	const { tablesList = [], isLoadingTablesList, errorTablesList } = useTablesList();

	const filteredTables = tablesList?.filter((table) =>
		table.tableName.toLowerCase().includes(searchTerm.toLowerCase()),
	);

	if (isLoadingTablesList) {
		return (
			<div className="flex-1 h-full overflow-y-auto pb-3 h-full flex items-center justify-center">
				<Spinner size="size-6" />
			</div>
		);
	}

	if (errorTablesList) {
		return (
			<div className="flex-1 overflow-y-auto pb-3 h-full flex items-center justify-center">
				Error: {errorTablesList.message}
			</div>
		);
	}

	return (
		<div className="flex-1 overflow-y-auto pb-3">
			{filteredTables && filteredTables.length > 0 ? (
				<ul>
					{filteredTables?.map((table) => (
						<SidebarListItem
							key={table.tableName}
							tableName={table.tableName}
							rowCount={table.rowCount}
						/>
					))}
				</ul>
			) : searchTerm ? (
				<div className="flex-1 overflow-y-auto pb-3 h-full flex items-center justify-center">
					No tables found matching
				</div>
			) : (
				<div className="flex-1 overflow-y-auto pb-3 h-full flex items-center justify-center">
					No tables available
				</div>
			)}
		</div>
	);
};
