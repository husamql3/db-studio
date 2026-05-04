import { Spinner } from "@db-studio/ui/spinner";
import { useQueryState } from "nuqs";
import { useEffect, useMemo } from "react";
import { SidebarListTablesItem } from "@/components/sidebar/sidebar-list-tables-item";
import { useTablesList } from "@/hooks/use-tables-list";
import { useDatabaseStore } from "@/stores/database.store";
import { CONSTANTS } from "@/utils/constants";

export const SidebarListTables = () => {
	const [searchTerm] = useQueryState(CONSTANTS.SIDEBAR_SEARCH, {
		defaultValue: "",
	});
	const [selectedSchema, setSelectedSchema] = useQueryState(CONSTANTS.ACTIVE_SCHEMA, {
		defaultValue: "all",
	});
	const { dbType } = useDatabaseStore();

	const { tablesList = [], isLoadingTablesList, errorTablesList } = useTablesList();
	const schemas = useMemo(
		() =>
			Array.from(
				new Set(
					tablesList
						.map((table) => table.schemaName)
						.filter((schema): schema is string => Boolean(schema)),
				),
			).sort(),
		[tablesList],
	);
	const showSchemaDropdown = dbType === "pg" && schemas.length > 1;

	const filteredTables = tablesList?.filter((table) => {
		const matchesSchema = selectedSchema === "all" || table.schemaName === selectedSchema;
		const matchesSearch = table.tableName.toLowerCase().includes(searchTerm.toLowerCase());
		return matchesSchema && matchesSearch;
	});

	useEffect(() => {
		if (!showSchemaDropdown || selectedSchema === "all" || schemas.includes(selectedSchema)) {
			return;
		}

		void setSelectedSchema("all");
	}, [schemas, selectedSchema, setSelectedSchema, showSchemaDropdown]);

	if (isLoadingTablesList) {
		return (
			<div className="flex-1 h-full overflow-y-auto pb-3 flex items-center justify-center">
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
						<SidebarListTablesItem
							key={
								table.schemaName ? `${table.schemaName}.${table.tableName}` : table.tableName
							}
							schemaName={table.schemaName}
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
