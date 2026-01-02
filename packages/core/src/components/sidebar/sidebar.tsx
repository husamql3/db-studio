import { SidebarHeader } from "@/components/sidebar/sidebar-tables-header";
import { SidebarTablesSearch } from "@/components/sidebar/sidebar-tables-search";
import { SidebarTablesList } from "@/components/sidebar/sidebar-tables-list";
import { SidebarWrapper } from "@/components/sidebar/sidebar-wrapper";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQueryState } from "nuqs";
import { CONSTANTS } from "@/utils/constants";
import { SidebarQueriesList } from "@/components/sidebar/sidebar-queries-list";
import { SidebarQueriesSearch } from "@/components/sidebar/sidebar-queries-search";

export const Sidebar = () => {
	const [activeTab] = useQueryState(CONSTANTS.ACTIVE_TAB);

	switch (activeTab) {
		case "table":
			return (
				<SidebarWrapper>
					<SidebarHeader />
					<SidebarTablesSearch />
					<ScrollArea className="flex-1 overflow-y-auto pb-3 block h-full w-full">
						<SidebarTablesList />
					</ScrollArea>
				</SidebarWrapper>
			);
		case "runner":
			return (
				<SidebarWrapper>
					<SidebarHeader />
					<SidebarQueriesSearch />
					<SidebarQueriesList />
				</SidebarWrapper>
			);
		default:
			return null;
	}
};
