import { useActiveTabStore } from "@/store/active-tab.store";
import { cn } from "@/utils/cn";

export const SidebarListItem = ({ tableName, rowCount }: { tableName: string; rowCount: number }) => {
  const { activeTab, setActiveTab } = useActiveTabStore();

  return (
    <li className="relative">
      <button
        type="button"
        onClick={() => setActiveTab(tableName)}
        className={cn(
          "w-full flex gap-2 px-4 py-1.5 text-sm transition-colors text-left",
          "hover:text-zinc-100 focus:outline-none focus:bg-blue-500/10 focus:text-zinc-100 justify-start items-center",
          activeTab === tableName ? "text-white bg-zinc-800/50" : "text-zinc-400",
        )}
      >
        {activeTab === tableName && <span className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />}
        <span className="flex-1">{tableName}</span>
        <span className="text-xs text-zinc-400">{rowCount}</span>
      </button>
    </li>
  );
};