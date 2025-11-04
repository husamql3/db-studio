import { useState } from "react";

import { SidebarHeader } from "./sidebar-header";
import { TablesList } from "../tables-list";
import { SidebarSearch } from "./sidebar-search";

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
      <TablesList
        searchTerm={searchTerm}
      />
    </div>
  );
};