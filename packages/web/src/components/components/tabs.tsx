import { Button } from "@db-studio/ui/button";
import { cn } from "@db-studio/ui/utils";
import { Link, useLocation, useParams } from "@tanstack/react-router";
import { useDatabaseStore } from "@/stores/database.store";
import { TABS } from "@/utils/constants";

export const Tabs = () => {
	const { pathname } = useLocation();
	const params = useParams({ strict: false });
	const currentRoute = pathname.split("/")[1] || "table";
	const { dbType } = useDatabaseStore();
	const routes = dbType === "redis" ? (["browser", "runner"] as const) : TABS;
	const activeTable = (params as { table?: string }).table;

	return (
		<div className="flex h-full items-center">
			{routes.map((route) => {
				// Keep the selected table when switching between the table data
				// view and the schema (edit table) view, so exiting edit mode
				// doesn't lose context (previously this went to /table with no
				// selection, leaving users stuck in schema mode).
				const keepTable = (route === "table" || route === "schema") && activeTable;

				return (
					<Link
						key={route}
						to={keepTable ? `/${route}/$table` : `/${route}`}
						params={keepTable ? { table: activeTable as string } : undefined}
						className="h-full flex items-center"
					>
						<Button
							variant="ghost"
							className={cn(
								"flex-1 px-4 border-l-0 border-y-0 border-r border-border h-full rounded-none capitalize text-xs font-medium transition-colors",
								currentRoute === route
									? "bg-muted text-foreground"
									: "text-muted-foreground hover:text-foreground hover:bg-muted/50",
							)}
						>
							{route}
						</Button>
					</Link>
				);
			})}
		</div>
	);
};
