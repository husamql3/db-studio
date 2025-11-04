import { useCallback } from "react";

import { useActiveTabStore } from "@/store/active-tab.store";
import { cn } from "@/utils/cn";
import { SidebarToggleButton } from "../sidebar/sidebar-toggle-button";

export const Tabs = () => {
	const { activeTab, setActiveTab } = useActiveTabStore();

	const handleTabChange = useCallback(
		(id: string) => {
			setActiveTab(id);
		},
		[setActiveTab],
	);

	const tabs = [
		{ id: "table", label: "Table" },
		{ id: "indexes", label: "Indexes" },
		{ id: "runner", label: "Runner" },
		{ id: "visualizer", label: "Visualizer" },
	];

	return (
		<div className="h-14 border-b border-zinc-800 divide-x divide-zinc-800 w-full flex items-center bg-black">
			<SidebarToggleButton />

			{/* Tab Navigation */}
			<div className="flex h-full">
				{tabs.map(({ id, label }) => (
					<button
						type="button"
						key={id}
						onClick={() => handleTabChange(id)}
						className={cn(
							"flex-1 font-medium transition-all duration-200 px-4 py-2 border-r border-zinc-800",
							activeTab === id ? "bg-zinc-900 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-700",
						)}
					>
						{label}
					</button>
				))}
			</div>
		</div>
	);
};
