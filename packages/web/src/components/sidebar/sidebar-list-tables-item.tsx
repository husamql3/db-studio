import type { TableInfoSchemaType } from "@db-studio/shared/types";
import { Kbd } from "@db-studio/ui/kbd";
import { cn } from "@db-studio/ui/utils";
import { Link, useLocation, useParams } from "@tanstack/react-router";
import { SidebarListTablesMenu } from "@/components/sidebar/sidebar-list-tables-menu";

export const SidebarListTablesItem = ({
	tableName,
	rowCount,
	schemaName,
}: TableInfoSchemaType) => {
	const params = useParams({ strict: false });
	const { pathname } = useLocation();
	const table = params.table as string | undefined;
	const isActive = table === tableName;

	const basePath = pathname.startsWith("/schema") ? "/schema/$table" : "/table/$table";

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
				<Link
					to={basePath}
					params={{
						table: tableName,
					}}
					className="flex-1 flex items-center gap-1 min-w-0 focus:outline-none"
				>
					<span className="flex-1 truncate">
						{schemaName && schemaName !== "public" ? `${schemaName}.` : ""}
						{tableName}
					</span>
					<Kbd>{rowCount}</Kbd>
				</Link>
				<div
					className={cn(
						"flex items-center h-5 shrink-0",
						isActive
							? "opacity-100"
							: "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
					)}
				>
					<SidebarListTablesMenu tableName={tableName} />
				</div>
			</div>
		</li>
	);
};
