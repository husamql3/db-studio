import { Link, useParams } from "@tanstack/react-router";
import type { TableInfoSchemaType } from "shared/types";
import { SidebarListTablesMenu } from "@/components/sidebar/sidebar-list-tables-menu";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

export const SidebarListTablesItem = ({ tableName, rowCount }: TableInfoSchemaType) => {
	const params = useParams({ strict: false });
	const table = params.table as string | undefined;
	const isActive = table === tableName;

	return (
		<li className="relative">
			<Link
				to="/table/$table"
				params={{
					table: tableName,
				}}
				className={cn(
					"w-full flex gap-0.5 px-4 py-1.5 text-sm transition-colors text-left",
					"hover:text-zinc-100 focus:outline-none focus:bg-accent/10 focus:text-zinc-100 justify-start items-center",
					isActive ? "text-white bg-zinc-800/50" : "text-zinc-400",
				)}
			>
				{isActive && <span className="absolute left-0 top-0 bottom-0 w-1 bg-accent" />}
				<span className="flex-1">{tableName}</span>
				<div className="flex items-center gap-1 h-5">
					{isActive && <SidebarListTablesMenu tableName={tableName} />}
					<Kbd>{rowCount}</Kbd>
				</div>
			</Link>
		</li>
	);
};
