import { Sheet, SheetContent, SheetTrigger } from "@db-studio/ui/sheet";
import { cn } from "@db-studio/ui/utils";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import {
	SIDEBAR_DEFAULT_WIDTH,
	usePersonalPreferencesStore,
} from "@/stores/personal-preferences.store";
import { CONSTANTS } from "@/utils/constants";

export const SidebarWrapper = ({ children }: { children: ReactNode }) => {
	const {
		sidebar: { width, mode },
		setSidebarWidth,
		setSidebarMode,
	} = usePersonalPreferencesStore();

	const isPinned = mode === "pinned";

	const handleResizeStart = (e: ReactMouseEvent) => {
		e.preventDefault();
		const startX = e.clientX;
		const startWidth = width;

		Object.assign(document.body.style, { cursor: "col-resize", userSelect: "none" });

		// Covers the page so iframes and other elements under the pointer cannot take the drag.
		const overlay = document.createElement("div");
		overlay.style.cssText = "position:fixed;inset:0;z-index:9999;cursor:col-resize;";
		document.body.appendChild(overlay);

		const onMouseMove = (event: MouseEvent) => {
			requestAnimationFrame(() => {
				const newWidth = startWidth + event.clientX - startX;
				// Dragging within 16px of the default width snaps onto it, so it is easy to get back to.
				setSidebarWidth(
					Math.abs(newWidth - SIDEBAR_DEFAULT_WIDTH) <= 16 ? SIDEBAR_DEFAULT_WIDTH : newWidth,
				);
			});
		};

		const onMouseUp = () => {
			Object.assign(document.body.style, { cursor: "", userSelect: "" });
			overlay.remove();
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
		};

		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseup", onMouseUp);
	};

	return (
		<Sheet
			open={mode !== "hidden"}
			onOpenChange={(open) => {
				if (!isPinned) setSidebarMode(open ? "peek" : "hidden");
			}}
			modal={false}
		>
			<SheetTrigger className="sr-only">Open Sidebar</SheetTrigger>
			<SheetContent
				side="left"
				showCloseButton={false}
				isPinned={isPinned}
				className="sidebar-behind-rail bg-sidebar border-r border-sidebar-border text-sidebar-foreground p-0"
				style={{ width: `${width}px`, left: `${CONSTANTS.RAIL_WIDTH}px` }}
				onOpenAutoFocus={(e) => e.preventDefault()}
				onMouseEnter={() => {
					if (!isPinned) setSidebarMode("peek");
				}}
				onMouseLeave={() => {
					if (!isPinned) setSidebarMode("hidden");
				}}
			>
				<div className="relative h-full flex flex-col">
					{children}

					<div
						role="button"
						tabIndex={0}
						onMouseDown={handleResizeStart}
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
