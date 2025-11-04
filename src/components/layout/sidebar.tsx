import { useRef, useCallback, useEffect } from "react";

import { usePersonalPreferencesStore } from "@/store/personal-preferences.store";
import { cn } from "@/utils/cn";
import { SidebarContent } from "./sidebar-content";

export const Sidebar = () => {
  const {
    sidebar,
    setSidebarWidth,
    setSidebarOpen,
  } = usePersonalPreferencesStore();

  const sidebarRef = useRef<HTMLElement>(null);
  const isResizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Optimized resize handler using RAF
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizingRef.current) return;

    requestAnimationFrame(() => {
      const delta = e.clientX - startXRef.current;
      const newWidth = startWidthRef.current + delta;
      setSidebarWidth(newWidth);
    });
  }, [setSidebarWidth]);

  const handleMouseUp = useCallback(() => {
    isResizingRef.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    // Remove overlay
    const overlay = document.getElementById('resize-overlay');
    if (overlay) overlay.remove();
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = sidebar.width;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    // Add overlay to prevent interference with iframe or other elements
    const overlay = document.createElement('div');
    overlay.id = 'resize-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;cursor:col-resize;';
    document.body.appendChild(overlay);
  }, [sidebar.width]);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Handle hover behavior when unpinned
  const handleMouseEnter = useCallback(() => {
    if (!sidebar.isPinned) {
      setSidebarOpen(true);
    }
  }, [sidebar.isPinned, setSidebarOpen]);

  const handleMouseLeave = useCallback(() => {
    if (!sidebar.isPinned) {
      setSidebarOpen(false);
    }
  }, [sidebar.isPinned, setSidebarOpen]);

  return (
    <aside
      ref={sidebarRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        width: `${sidebar.width}px`,
      }}
      className={cn(
        "fixed left-0 top-0 bg-black border-r border-zinc-800 z-50 h-dvh",
        "transition-transform duration-300 ease-out",
        sidebar.isOpen || sidebar.isPinned ? "translate-x-0" : "-translate-x-full"
      )}
    >
      <SidebarContent />

      {/* Resize Handle */}
      <div
        onMouseDown={handleMouseDown}
        className={cn(
          "absolute top-0 right-0 w-1 h-full cursor-col-resize",
          "hover:bg-blue-500/50 transition-colors group"
        )}
        title="Drag to resize"
      >
        {/* Visual indicator on hover */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-12 bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity rounded-full" />
      </div>
    </aside>
  );
};