import { useLocation } from "@tanstack/react-router";
import { SidebarContentQueriesList } from "@/components/sidebar/sidebar-content-queries-list";
import { SidebarContentTablesList } from "@/components/sidebar/sidebar-content-tables-list";
import { SidebarFooter } from "@/components/sidebar/sidebar-footer";
import { SidebarWrapper } from "@/components/sidebar/sidebar-wrapper";
import { RedisKeySidebar } from "@/features/redis-browser";
import { useIsKeyValue } from "@/hooks/use-is-schemaless";
import { sectionOf } from "@/lib/sections";

export const Sidebar = () => {
	const { pathname } = useLocation();
	const isKeyValue = useIsKeyValue();

	return (
		<SidebarWrapper>
			{sectionOf(pathname)?.sidebar === "queries" ? (
				<SidebarContentQueriesList />
			) : isKeyValue ? (
				<RedisKeySidebar />
			) : (
				<SidebarContentTablesList />
			)}
			<SidebarFooter />
		</SidebarWrapper>
	);
};
