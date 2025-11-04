import { Pin, PinOff, Plus } from "lucide-react";

import { usePersonalPreferencesStore } from "@/store/personal-preferences.store";

export const SidebarHeader = () => {
  const {
    sidebar,
    toggleSidebarPinned,
    setSidebarOpen,
  } = usePersonalPreferencesStore();

  return (
    <div className="flex items-center justify-between h-8 space-y-2 border-b border-zinc-800">
      <button
        type="button"
        onClick={toggleSidebarPinned}
        className="size-8 flex items-center justify-center rounded-lg transition-color"
        title={sidebar.isPinned ? "Unpin sidebar" : "Pin sidebar"}
      >
        {sidebar.isPinned
          ? <Pin className="size-4" />
          : <PinOff className="size-4" />}
      </button>

      {!sidebar.isPinned && (
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="size-8 flex items-center justify-center rounded-lg transition-color"
          title="Close sidebar"
        >
          <Plus className="size-4 rotate-45" />
        </button>
      )}
    </div>
  );
};