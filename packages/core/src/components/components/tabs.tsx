import { useQueryState } from "nuqs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CONSTANTS, TABS } from "@/utils/constants";
export const Tabs = () => {
	const [activeTab, setActiveTab] = useQueryState(CONSTANTS.ACTIVE_TAB, {
		shallow: true,
	});

	return (
		<div className="flex h-full items-center">
			{TABS.map(({ id, label }) => (
				<Button
					key={id}
					variant="ghost"
					onClick={() => setActiveTab(id.toLowerCase())}
					className={cn(
						"flex-1 px-4 border-l-0 border-y-0 border-r border-zinc-800 h-full rounded-none",
						activeTab === label ? "bg-zinc-900 text-white" : "text-zinc-400",
					)}
				>
					{label}
				</Button>
			))}
		</div>
	);
};
