import { useLocation } from "@tanstack/react-router";
import { useMemo } from "react";
import { SidebarContentQueriesList } from "@/components/sidebar/sidebar-content-queries-list";
import { SidebarContentTablesList } from "@/components/sidebar/sidebar-content-tables-list";
import { SidebarFooter } from "@/components/sidebar/sidebar-footer";
import { SidebarHeader } from "@/components/sidebar/sidebar-tables-header";
import { SidebarWrapper } from "@/components/sidebar/sidebar-wrapper";

export const Sidebar = () => {
	const { pathname } = useLocation();
	const path = pathname.split("/")[1];

	const renderContent = useMemo(() => {
		console.log(path);
		switch (path) {
			case "":
			case "table":
				return <SidebarContentTablesList />;
			case "runner":
				return <SidebarContentQueriesList />;
			default:
				return <SidebarContentTablesList />;
			// todo
			// case "/indexes":
			// case "/logs":
			// case "/schema":
			// case "/visualizer":
		}
	}, [path]);

	return (
		<SidebarWrapper>
			<SidebarHeader />
			{renderContent}
			<SidebarFooter />
		</SidebarWrapper>
	);
};
