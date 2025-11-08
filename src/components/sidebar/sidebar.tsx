import { useCallback, useEffect, useRef } from "react";
import { SidebarContent } from "@/components/sidebar/sidebar-content";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";
import { cn } from "@/utils/cn";
import { HOVER_DELAY, HOVER_ZONE } from "@/utils/constans";

export const Sidebar = () => {
	const {
		sidebar: { width, isOpen, isPinned },
		setSidebarWidth,
		setSidebarOpen,
	} = usePersonalPreferencesStore();

	const sidebarRef = useRef<HTMLElement>(null);
	const isResizingRef = useRef(false);
	const startXRef = useRef(0);
	const startWidthRef = useRef(0);
	const hoverTimeoutRef = useRef<number | null>(null);

	// Optimized resize handler using RAF
	const handleMouseMove = useCallback(
		(e: MouseEvent) => {
			if (!isResizingRef.current) return;

			requestAnimationFrame(() => {
				const delta = e.clientX - startXRef.current;
				const newWidth = startWidthRef.current + delta;
				setSidebarWidth(newWidth);
			});
		},
		[setSidebarWidth],
	);

	const handleMouseUp = useCallback(() => {
		isResizingRef.current = false;
		document.body.style.cursor = "";
		document.body.style.userSelect = "";

		// Remove overlay
		const overlay = document.getElementById("resize-overlay");
		if (overlay) overlay.remove();
	}, []);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			isResizingRef.current = true;
			startXRef.current = e.clientX;
			startWidthRef.current = width;

			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";

			// Add overlay to prevent interference with iframe or other elements
			const overlay = document.createElement("div");
			overlay.id = "resize-overlay";
			overlay.style.cssText = "position:fixed;inset:0;z-index:9999;cursor:col-resize;";
			document.body.appendChild(overlay);
		},
		[width],
	);

	// Handle hover behavior when unpinned
	const handleMouseEnter = useCallback(() => {
		if (!isPinned) {
			setSidebarOpen(true);
		}
	}, [isPinned, setSidebarOpen]);

	const handleMouseLeave = useCallback(() => {
		if (!isPinned) {
			setSidebarOpen(false);
		}
	}, [isPinned, setSidebarOpen]);

	// Edge hover detection - opens sidebar when mouse is near left edge
	const handleEdgeHover = useCallback(
		(e: MouseEvent) => {
			// Don't trigger if sidebar is already pinned or open, or if resizing
			if (isPinned || isOpen || isResizingRef.current) return;

			if (e.clientX <= HOVER_ZONE) {
				// Clear any existing timeout
				if (hoverTimeoutRef.current) {
					clearTimeout(hoverTimeoutRef.current);
				}

				// Set a small delay to avoid accidental triggers
				hoverTimeoutRef.current = setTimeout(() => {
					setSidebarOpen(true);
				}, HOVER_DELAY);
			} else if (e.clientX > HOVER_ZONE + 50) {
				// Clear timeout if mouse moves away before delay completes
				if (hoverTimeoutRef.current) {
					clearTimeout(hoverTimeoutRef.current);
				}
			}
		},
		[isPinned, isOpen, setSidebarOpen],
	);

	useEffect(() => {
		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);
		document.addEventListener("mousemove", handleEdgeHover);

		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
			document.removeEventListener("mousemove", handleEdgeHover);

			// Clear timeout on cleanup
			if (hoverTimeoutRef.current) {
				clearTimeout(hoverTimeoutRef.current);
			}
		};
	}, [handleMouseMove, handleMouseUp, handleEdgeHover]);

	return (
		<aside
			ref={sidebarRef}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
			style={{
				width: `${width}px`,
			}}
			className={cn(
				"fixed left-0 top-0 bg-black border-r border-zinc-800 z-50 h-dvh",
				"transition-transform duration-300 ease-out",
				isOpen || isPinned ? "translate-x-0" : "-translate-x-full",
			)}
		>
			<SidebarContent />

			{/* Resize Handle */}
			<div
				role="button"
				tabIndex={0}
				onMouseDown={handleMouseDown}
				className={cn(
					"absolute top-0 right-0 w-1 h-full cursor-col-resize",
					"hover:bg-blue-500/50 transition-colors group",
				)}
				title="Drag to resize"
			>
				{/* Visual indicator on hover */}
				<div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-12 bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity rounded-full " />
			</div>
		</aside>
	);
};
