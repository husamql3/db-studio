import { useState } from "react";
import { SidebarHeader } from "@/components/sidebar/sidebar-header";
import { SidebarSearch } from "@/components/sidebar/sidebar-search";
import { TablesList } from "@/components/sidebar/sidebar-tables-list";

export const SidebarContent = () => {
	const [searchTerm, setSearchTerm] = useState("");

	return (
		<div className="flex flex-col h-full">
			{/* Sidebar Header */}
			<SidebarHeader />

			{/* Sidebar Search */}
			<SidebarSearch
				setSearchTerm={setSearchTerm}
				searchTerm={searchTerm}
			/>

			{/* Tables List */}
			<TablesList searchTerm={searchTerm} />
		</div>
	);
};
