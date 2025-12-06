import { SidebarToggleButton } from "@/components/sidebar/sidebar-toggle-button";
import { useActiveTabStore } from "@/stores/active-tab.store";
import { cn } from "@/utils/cn";
import { TABS } from "@/utils/constants/constans";

export const Tabs = () => {
	const { activeTab, setActiveTab } = useActiveTabStore();

	return (
		<div className="border-b border-zinc-800 divide-x divide-zinc-800 w-full flex items-center bg-black">
			<SidebarToggleButton />

			{/* Tab Navigation */}
			<div className="flex h-full">
				{TABS.map(({ id, label }) => (
					<button
						type="button"
						key={id}
						onClick={() => setActiveTab(id)}
						className={cn(
							"flex-1 font-medium transition-all duration-200 px-4 py-2 border-r border-zinc-800",
							activeTab === id
								? "bg-zinc-900 text-white"
								: "text-zinc-400 hover:text-white hover:bg-zinc-700",
						)}
					>
						{label}
					</button>
				))}
			</div>
		</div>
	);
};
