import { useLocation } from "@tanstack/react-router";
import { useMemo } from "react";
import { SidebarContentQueriesList } from "@/components/sidebar/sidebar-content-queries-list";
import { SidebarContentTablesList } from "@/components/sidebar/sidebar-content-tables-list";
import { SidebarFooter } from "@/components/sidebar/sidebar-footer";
import { SidebarHeader } from "@/components/sidebar/sidebar-tables-header";
import { SidebarWrapper } from "@/components/sidebar/sidebar-wrapper";
import { RedisKeySidebar } from "@/features/redis-browser/components/redis-key-sidebar";
import { useDatabaseStore } from "@/stores/database.store";

export const Sidebar = () => {
	const { pathname } = useLocation();
	const path = pathname.split("/")[1];
	const { dbType } = useDatabaseStore();

	const renderContent = useMemo(() => {
		if (dbType === "redis" && path !== "runner") return <RedisKeySidebar />;
		switch (path) {
			case "":
			case "table":
			case "schema":
				return <SidebarContentTablesList />;
			case "runner":
				return <SidebarContentQueriesList />;
			default:
				return <SidebarContentTablesList />;
			// todo
			// case "indexes":
			// case "logs":
			// case "visualizer":
		}
	}, [dbType, path]);

	return (
		<SidebarWrapper>
			<SidebarHeader />
			{renderContent}
			<SidebarFooter />
		</SidebarWrapper>
	);
};
