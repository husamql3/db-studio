import { Spinner } from "@db-studio/ui/spinner";
import { useQueryState } from "nuqs";
import { useEffect, useMemo } from "react";
import { SidebarListTablesItem } from "@/components/sidebar/sidebar-list-tables-item";
import { EditTableSheet } from "@/features/schema";
import { useDatabaseEngine } from "@/hooks/use-database-engine";
import { useTablesList } from "@/hooks/use-tables-list";
import { CONSTANTS } from "@/utils/constants";
import { tableId } from "@/utils/table-id";

export const SidebarListTables = () => {
	const [searchTerm] = useQueryState(CONSTANTS.SIDEBAR_SEARCH, {
		defaultValue: "",
	});

	const [selectedSchema, setSelectedSchema] = useQueryState(CONSTANTS.ACTIVE_SCHEMA, {
		defaultValue: CONSTANTS.ALL_SCHEMAS,
	});

	const engine = useDatabaseEngine();

	const { tablesList = [], isLoadingTablesList, errorTablesList } = useTablesList();

	const schemas = useMemo(
		() =>
			Array.from(
				new Set(
					tablesList.reduce<string[]>((acc, table) => {
						if (table.schemaName) acc.push(table.schemaName);

						return acc;
					}, []),
				),
			).sort(),
		[tablesList],
	);

	const showSchemaDropdown = (engine?.schemaSelector ?? false) && schemas.length > 1;

	// One schema in view: the dropdown already names it, so the prefix only widens rows.
	const showSchemaName = selectedSchema === CONSTANTS.ALL_SCHEMAS && schemas.length > 1;

	const filteredTables = tablesList?.filter((table) => {
		const matchesSchema =
			selectedSchema === CONSTANTS.ALL_SCHEMAS || table.schemaName === selectedSchema;

		const matchesSearch = table.tableName.toLowerCase().includes(searchTerm.toLowerCase());

		return matchesSchema && matchesSearch;
	});

	useEffect(() => {
		if (
			!showSchemaDropdown ||
			selectedSchema === CONSTANTS.ALL_SCHEMAS ||
			schemas.includes(selectedSchema)
		) {
			return;
		}

		void setSelectedSchema(CONSTANTS.ALL_SCHEMAS);
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
		<>
			<div className="flex-1 overflow-y-auto pb-3">
				{filteredTables && filteredTables.length > 0 ? (
					<ul>
						{filteredTables?.map((table) => (
							<SidebarListTablesItem
								key={tableId(table)}
								schemaName={table.schemaName}
								showSchemaName={showSchemaName}
								tableName={table.tableName}
								rowCount={table.rowCount}
								rowCountEstimated={table.rowCountEstimated}
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
			<EditTableSheet />
		</>
	);
};
