import { useQueryState } from "nuqs";
import { SidebarQueriesList } from "@/components/sidebar/sidebar-queries-list";
import { SidebarTablesList } from "@/components/sidebar/sidebar-tables-list";
import { CONSTANTS } from "@/utils/constants";

export const SidebarContent = () => {
	const [activeTab] = useQueryState(CONSTANTS.ACTIVE_TAB);

	switch (activeTab) {
		case "table":
			return <SidebarTablesList />;
		case "runner":
			return <SidebarQueriesList />;
		default:
			return null;
	}
};
