import type { TableInfoSchemaType } from "@db-studio/shared/types";
import { Kbd } from "@db-studio/ui/kbd";
import { cn } from "@db-studio/ui/utils";
import { Link, useLocation, useParams } from "@tanstack/react-router";
import { useQueryState } from "nuqs";
import { SidebarListTablesMenu } from "@/components/sidebar/sidebar-list-tables-menu";
import { tableId } from "@/features/visualizer";
import { useTableSchemaName } from "@/hooks/use-table-schema-name";
import { CONSTANTS } from "@/utils/constants";

export const SidebarListTablesItem = ({
	tableName,
	rowCount,
	rowCountEstimated,
	schemaName,
}: TableInfoSchemaType) => {
	const params = useParams({ strict: false });
	const { pathname } = useLocation();
	const table = params.table as string | undefined;
	// The visualizer keeps its focused table in the URL instead of a route param.
	const [focusedTable, setFocusedTable] = useQueryState(CONSTANTS.ACTIVE_TABLE);
	const isVisualizer = pathname.startsWith("/visualizer");
	const id = tableId({ schemaName, tableName });
	// A link without a schema predates it and matches every same-named table.
	const openSchema = useTableSchemaName();
	const isActive = isVisualizer
		? focusedTable === id
		: table === tableName && (openSchema === undefined || openSchema === schemaName);

	const basePath = pathname.startsWith("/schema")
		? "/schema/$table"
		: pathname.startsWith("/indexes")
			? "/indexes/$table"
			: "/table/$table";

	const label = (
		<span className="flex-1 truncate">
			{schemaName && schemaName !== "public" ? `${schemaName}.` : ""}
			{tableName}
		</span>
	);

	return (
		<li className="relative group">
			{isActive && <span className="absolute left-0 top-0 bottom-0 w-1 bg-primary z-10" />}
			<div
				className={cn(
					"w-full flex gap-0.5 pl-4 pr-2 py-1.5 text-sm transition-colors text-left justify-start items-center focus:outline-none",
					isActive
						? "text-sidebar-accent-foreground bg-sidebar-accent font-medium"
						: "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 focus:bg-sidebar-accent focus:text-sidebar-accent-foreground",
				)}
			>
				{isVisualizer ? (
					<button
						type="button"
						onClick={() => void setFocusedTable(id)}
						className="flex-1 flex items-center gap-1 min-w-0 text-left focus:outline-none"
					>
						{label}
					</button>
				) : (
					<Link
						to={basePath}
						params={{
							table: tableName,
						}}
						search={{ [CONSTANTS.TABLE_SCHEMA]: schemaName }}
						className="flex-1 flex items-center gap-1 min-w-0 focus:outline-none"
					>
						{label}
					</Link>
				)}
				<div className="flex items-center gap-1 h-5 shrink-0">
					<div
						className={cn(
							isActive
								? "opacity-100"
								: "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
						)}
					>
						<SidebarListTablesMenu
							tableName={tableName}
							schemaName={schemaName}
						/>
					</div>
					<Kbd>
						{rowCountEstimated && "~"}
						{rowCount}
					</Kbd>
				</div>
			</div>
		</li>
	);
};
