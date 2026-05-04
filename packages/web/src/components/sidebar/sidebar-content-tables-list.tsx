import { ScrollArea } from "@db-studio/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@db-studio/ui/select";
import { useQueryState } from "nuqs";
import { useMemo } from "react";
import { SidebarListTables } from "@/components/sidebar/sidebar-list-tables";
import { SidebarSearchTables } from "@/components/sidebar/sidebar-search-tables";
import { useTablesList } from "@/hooks/use-tables-list";
import { useDatabaseStore } from "@/stores/database.store";
import { CONSTANTS } from "@/utils/constants";

const SidebarSchemaDropdown = () => {
	const [selectedSchema, setSelectedSchema] = useQueryState(CONSTANTS.ACTIVE_SCHEMA, {
		defaultValue: "all",
	});
	const { dbType } = useDatabaseStore();
	const { tablesList = [] } = useTablesList();

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

	if (!showSchemaDropdown) return null;

	return (
		<div className="px-3 pt-3">
			<Select
				value={selectedSchema}
				onValueChange={setSelectedSchema}
			>
				<SelectTrigger className="w-full justify-between h-8">
					<SelectValue placeholder="Select schema" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All schemas</SelectItem>
					{schemas.map((schema) => (
						<SelectItem
							key={schema}
							value={schema}
						>
							{schema}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
};

export const SidebarContentTablesList = () => {
	return (
		<>
			<SidebarSchemaDropdown />
			<SidebarSearchTables />
			<ScrollArea className="flex-1 overflow-y-auto pb-3 block h-full w-full">
				<SidebarListTables />
			</ScrollArea>
		</>
	);
};
