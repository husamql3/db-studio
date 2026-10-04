import { META } from "@db-studio/shared/constants";
import type { ReactNode } from "react";
import { showsDesktopTitleBar } from "@/lib/desktop";

/**
 * Draggable title strip for the macOS desktop app (the window itself has no native title bar).
 * Left padding clears the traffic lights; children render as non-drag controls next to them.
 */
export const DesktopTitleBar = ({ children }: { children?: ReactNode }) => {
	if (!showsDesktopTitleBar) return null;

	return (
		<div
			className="flex h-[var(--desktop-title-bar-height)] shrink-0 select-none items-center gap-2 border-b border-border bg-background pl-[78px] pr-3 [-webkit-app-region:drag]"
			data-slot="desktop-title-bar"
		>
			{children && (
				<div className="flex items-center gap-1 [-webkit-app-region:no-drag]">{children}</div>
			)}
			<span className="text-xs font-medium text-muted-foreground">{META.SITE_TITLE}</span>
		</div>
	);
};
