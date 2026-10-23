import { Sheet, SheetContent, SheetTrigger } from "@db-studio/ui/sheet";
import { cn } from "@db-studio/ui/utils";
import { type ReactNode, useCallback, useEffect, useRef } from "react";
import {
	SIDEBAR_DEFAULT_WIDTH,
	usePersonalPreferencesStore,
} from "@/stores/personal-preferences.store";
import { CONSTANTS } from "@/utils/constants";

export const SidebarWrapper = ({ children }: { children: ReactNode }) => {
	const {
		sidebar: { width, isOpen, isPinned },
		setSidebarWidth,
		setSidebarOpen,
	} = usePersonalPreferencesStore();

	const isResizingRef = useRef(false);
	const startXRef = useRef(0);
	const startWidthRef = useRef(0);
	const sheetContentRef = useRef<HTMLDivElement>(null);

	// Handler refs — updated every render so the stable listeners always call the latest handler
	const handleMouseMoveRef = useRef((_e: MouseEvent) => {});
	const handleMouseUpRef = useRef(() => {});
	const handleMouseEnterRef = useRef(() => {});
	const handleMouseLeaveRef = useRef(() => {});

	// Optimized resize handler using RAF
	const handleMouseMove = useCallback(
		(e: MouseEvent) => {
			if (!isResizingRef.current) return;

			requestAnimationFrame(() => {
				const delta = e.clientX - startXRef.current;
				const newWidth = startWidthRef.current + delta;
				// Dragging within 16px of the default width snaps onto it, so it is easy to get back to.
				setSidebarWidth(
					Math.abs(newWidth - SIDEBAR_DEFAULT_WIDTH) <= 16 ? SIDEBAR_DEFAULT_WIDTH : newWidth,
				);
			});
		},
		[setSidebarWidth],
	);

	const handleMouseUp = useCallback(() => {
		isResizingRef.current = false;
		Object.assign(document.body.style, { cursor: "", userSelect: "" });

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

			Object.assign(document.body.style, { cursor: "col-resize", userSelect: "none" });

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

	// Keep handler refs current every render so stable listeners always use the latest handler
	handleMouseMoveRef.current = handleMouseMove;
	handleMouseUpRef.current = handleMouseUp;
	handleMouseEnterRef.current = handleMouseEnter;
	handleMouseLeaveRef.current = handleMouseLeave;

	const handleOpenChange = (open: boolean) => {
		if (!isPinned) {
			setSidebarOpen(open);
		}
	};

	useEffect(() => {
		const onMouseMove = (e: MouseEvent) => handleMouseMoveRef.current(e);
		const onMouseUp = () => handleMouseUpRef.current();

		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseup", onMouseUp);

		return () => {
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
		};
	}, []); // empty deps — listeners are stable, handlers updated via refs

	// Attach mouse enter/leave handlers to the Sheet content
	useEffect(() => {
		const element = sheetContentRef.current;
		if (!element) return;

		const onMouseEnter = () => handleMouseEnterRef.current();
		const onMouseLeave = () => handleMouseLeaveRef.current();

		element.addEventListener("mouseenter", onMouseEnter);
		element.addEventListener("mouseleave", onMouseLeave);

		return () => {
			element.removeEventListener("mouseenter", onMouseEnter);
			element.removeEventListener("mouseleave", onMouseLeave);
		};
	}, []); // empty deps — listeners are stable, handlers updated via refs

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
				isPinned={isPinned}
				className="sidebar-behind-rail bg-sidebar border-r border-sidebar-border text-sidebar-foreground p-0"
				style={{ width: `${width}px`, left: `${CONSTANTS.RAIL_WIDTH}px` }}
				onOpenAutoFocus={(e) => e.preventDefault()}
			>
				<div className="relative h-full flex flex-col">
					{children}

					{/* Resize Handle */}
					<div
						role="button"
						tabIndex={0}
						onMouseDown={handleMouseDown}
						className={cn(
							"absolute inset-y-0 -right-1.5 w-3 cursor-col-resize z-50 outline-none",
							"after:absolute after:inset-y-0 after:left-1/2 after:w-px after:transition-colors",
							"hover:after:bg-blue-400/70 active:after:bg-blue-400/70 focus-visible:after:bg-blue-400/70",
						)}
						title="Drag to resize sidebar"
					/>
				</div>
			</SheetContent>
		</Sheet>
	);
};
