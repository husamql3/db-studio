import { useTables } from "@/hooks/use-tables";
import { SidebarListItem } from "./layout/sidebar-list-item";
import { useMemo } from "react";

export const TablesList = ({ searchTerm }: { searchTerm: string }) => {
  const { tables } = useTables();

  const filteredTables = useMemo(() => {
    if (!tables) return [];
    if (!searchTerm.trim()) return tables;

    const lowerSearchTerm = searchTerm.toLowerCase();
    return tables.filter((table) =>
      table.tableName.toLowerCase().includes(lowerSearchTerm)
    );
  }, [tables, searchTerm]);

  return (
    <div className="flex-1 overflow-y-auto">
      {filteredTables.length > 0 ? (
        <ul>
          {filteredTables.map((table) => (
            <SidebarListItem
              key={table.tableName}
              tableName={table.tableName}
              rowCount={table.rowCount}
            />
          ))}
        </ul>
      ) : searchTerm ? (
        <div className="px-4 py-8 text-center text-sm text-zinc-500">
          No tables found matching
        </div>
      ) : (
        <div className="px-4 py-8 text-center text-sm text-zinc-500">
          No tables available
        </div>
      )}
    </div>
  );
};