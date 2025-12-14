import { useQueryState } from "nuqs";
import { SidebarToggleButton } from "@/components/sidebar/sidebar-toggle-btn";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CONSTANTS, TABS } from "@/utils/constants";

export const Tabs = () => {
	const [activeTab, setActiveTab] = useQueryState(CONSTANTS.ACTIVE_TABLE, {
		shallow: true,
	});

	return (
		<div className="border-b border-zinc-800 divide-x divide-zinc-800 w-full flex items-center bg-black h-14">
			<SidebarToggleButton />

			{/* Tab Navigation */}
			<div className="flex h-full items-center">
				{TABS.map(({ id, label }) => (
					<Button
						key={id}
						variant="ghost"
						onClick={() => setActiveTab(id)}
						className={cn(
							"flex-1 px-4 py-2 border-l-0 border-y-0 border-r border-zinc-800 h-full rounded-none",
							activeTab === id ? "bg-zinc-900 text-white" : "text-zinc-400",
						)}
					>
						{label}
					</Button>
				))}
			</div>
		</div>
	);
};
