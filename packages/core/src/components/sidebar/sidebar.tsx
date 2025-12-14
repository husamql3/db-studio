import { useCallback, useEffect, useRef } from "react";
import { SidebarHeader } from "@/components/sidebar/sidebar-header";
import { SidebarList } from "@/components/sidebar/sidebar-list";
import { SidebarSearch } from "@/components/sidebar/sidebar-search";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";
import { CONSTANTS } from "@/utils/constants";
export const Sidebar = () => {
	const {
		sidebar: { width, isOpen, isPinned },
		setSidebarWidth,
		setSidebarOpen,
	} = usePersonalPreferencesStore();

	const isResizingRef = useRef(false);
	const startXRef = useRef(0);
	const startWidthRef = useRef(0);
	const hoverTimeoutRef = useRef<number | null>(null);
	const sheetContentRef = useRef<HTMLDivElement>(null);

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

			if (e.clientX <= CONSTANTS.HOVER_ZONE) {
				// Clear any existing timeout
				if (hoverTimeoutRef.current) {
					clearTimeout(hoverTimeoutRef.current);
				}

				// Set a small delay to avoid accidental triggers
				hoverTimeoutRef.current = window.setTimeout(() => {
					setSidebarOpen(true);
				}, CONSTANTS.HOVER_DELAY);
			} else if (e.clientX > CONSTANTS.HOVER_ZONE + 50) {
				// Clear timeout if mouse moves away before delay completes
				if (hoverTimeoutRef.current) {
					clearTimeout(hoverTimeoutRef.current);
				}
			}
		},
		[isPinned, isOpen, setSidebarOpen],
	);

	const handleOpenChange = (open: boolean) => {
		if (!isPinned) {
			setSidebarOpen(open);
		}
	};

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

	// Attach mouse enter/leave handlers to the Sheet content
	useEffect(() => {
		const element = sheetContentRef.current;
		if (!element) return;

		element.addEventListener("mouseenter", handleMouseEnter);
		element.addEventListener("mouseleave", handleMouseLeave);

		return () => {
			element.removeEventListener("mouseenter", handleMouseEnter);
			element.removeEventListener("mouseleave", handleMouseLeave);
		};
	}, [handleMouseEnter, handleMouseLeave]);

	return (
		<Sheet
			open={isOpen}
			onOpenChange={handleOpenChange}
			modal={false}
		>
			<SheetTrigger className="sr-only">Open Sidebar</SheetTrigger>
			<SheetContent
				ref={sheetContentRef}
				side="left"
				showCloseButton={false}
				className={cn(
					"bg-black border-r border-zinc-800 p-0",
					"transition-transform duration-300 ease-out",
				)}
				style={{ width: `${width}px` }}
			>
				<div className="relative h-full flex flex-col">
					<SidebarHeader />
					<SidebarSearch />
					<ScrollArea className="flex-1 overflow-y-auto pb-3">
						<SidebarList />
					</ScrollArea>

					{/* Resize Handle */}
					<div
						role="button"
						tabIndex={0}
						onMouseDown={handleMouseDown}
						className={cn(
							"absolute top-0 right-0 w-2 h-full cursor-col-resize z-50",
							"hover:bg-blue-500/50 transition-colors group",
						)}
						title="Drag to resize"
					>
						{/* Visual indicator on hover */}
						<div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-12 bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity rounded-full" />
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
};
