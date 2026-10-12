import { useLocation } from "@tanstack/react-router";
import { useMemo } from "react";
import { SidebarContentQueriesList } from "@/components/sidebar/sidebar-content-queries-list";
import { SidebarContentTablesList } from "@/components/sidebar/sidebar-content-tables-list";
import { SidebarFooter } from "@/components/sidebar/sidebar-footer";
import { SidebarHeader } from "@/components/sidebar/sidebar-tables-header";
import { SidebarWrapper } from "@/components/sidebar/sidebar-wrapper";
import { RedisKeySidebar } from "@/features/redis-browser/components/redis-key-sidebar";
import { useDatabaseEngine } from "@/hooks/use-database-engine";

export const Sidebar = () => {
	const { pathname } = useLocation();
	const path = pathname.split("/")[1];
	const isKeyValue = useDatabaseEngine()?.dataModel === "key-value";

	const renderContent = useMemo(() => {
		if (isKeyValue && path !== "runner") return <RedisKeySidebar />;
		switch (path) {
			case "":
			case "table":
			case "schema":
			case "indexes":
				return <SidebarContentTablesList />;
			case "runner":
				return <SidebarContentQueriesList />;
			default:
				return <SidebarContentTablesList />;
			// todo
			// case "logs":
			// case "visualizer":
		}
	}, [isKeyValue, path]);

	return (
		<SidebarWrapper>
			<SidebarHeader />
			{renderContent}
			<SidebarFooter />
		</SidebarWrapper>
	);
};
