import { SidebarContent } from "@/components/sidebar/sidebar-content";
import { SidebarHeader } from "@/components/sidebar/sidebar-header";
import { SidebarSearch } from "@/components/sidebar/sidebar-search";
import { SidebarWrapper } from "@/components/sidebar/sidebar-wrapper";
import { ScrollArea } from "@/components/ui/scroll-area";

export const Sidebar = () => {
	return (
		<SidebarWrapper>
			<SidebarHeader />
			<SidebarSearch />
			<ScrollArea className="flex-1 overflow-y-auto pb-3 block h-full w-full">
				<SidebarContent />
			</ScrollArea>
		</SidebarWrapper>
	);
};
