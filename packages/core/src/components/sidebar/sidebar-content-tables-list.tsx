import { SidebarListTables } from "@/components/sidebar/sidebar-list-tables";
import { SidebarSearchTables } from "@/components/sidebar/sidebar-search-tables";
import { ScrollArea } from "@/components/ui/scroll-area";

export const SidebarContentTablesList = () => {
	return (
		<>
			<SidebarSearchTables />
			<ScrollArea className="flex-1 overflow-y-auto pb-3 block h-full w-full">
				<SidebarListTables />
			</ScrollArea>
		</>
	);
};
