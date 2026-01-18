import { Link, useLocation } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TABS } from "@/utils/constants";

export const Tabs = () => {
	const { pathname } = useLocation();
	const currentRoute = pathname.split("/")[1] || "table";

	return (
		<div className="flex h-full items-center">
			{TABS.map((route) => (
				<Link
					key={route}
					to={`/${route}`}
					className="h-full flex items-center"
				>
					<Button
						variant="ghost"
						className={cn(
							"flex-1 px-4 border-l-0 border-y-0 border-r border-zinc-800 h-full rounded-none",
							currentRoute === route
								? "bg-zinc-900 text-white"
								: "text-zinc-400",
						)}
					>
						{route}
					</Button>
				</Link>
			))}
		</div>
	);
};
