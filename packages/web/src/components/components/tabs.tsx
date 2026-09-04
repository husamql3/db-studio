import { Button } from "@db-studio/ui/button";
import { cn } from "@db-studio/ui/utils";
import { Link, useLocation } from "@tanstack/react-router";
import { useDatabaseStore } from "@/stores/database.store";
import { TABS } from "@/utils/constants";

export const Tabs = () => {
	const { pathname } = useLocation();
	const currentRoute = pathname.split("/")[1] || "table";
	const { dbType } = useDatabaseStore();
	const routes = dbType === "redis" ? (["browser", "runner"] as const) : TABS;

	return (
		<div className="flex h-full items-center">
			{routes.map((route) => (
				<Link
					key={route}
					to={`/${route}`}
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
			))}
		</div>
	);
};
