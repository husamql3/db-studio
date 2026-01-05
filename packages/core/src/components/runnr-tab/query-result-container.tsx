import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { usePersonalPreferencesStore } from "@/stores/personal-preferences.store";

export const QueryResultContainer = () => {
	const {
		runnerResults: { height },
		setRunnerResultsHeight,
	} = usePersonalPreferencesStore();

	// Resize handlers for results container
	const isResizingRef = useRef(false);
	const startYRef = useRef(0);
	const startHeightRef = useRef(0);

	// Optimized resize handler using RAF (vertical resize)
	const handleMouseMove = useCallback(
		(e: MouseEvent) => {
			if (!isResizingRef.current) return;

			requestAnimationFrame(() => {
				const delta = startYRef.current - e.clientY; // Inverted because we resize from bottom
				const newHeight = startHeightRef.current + delta;
				setRunnerResultsHeight(newHeight);
			});
		},
		[setRunnerResultsHeight],
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
			startYRef.current = e.clientY;
			startHeightRef.current = height;

			document.body.style.cursor = "row-resize";
			document.body.style.userSelect = "none";

			// Add overlay to prevent interference with iframe or other elements
			const overlay = document.createElement("div");
			overlay.id = "resize-overlay";
			overlay.style.cssText = "position:fixed;inset:0;z-index:9999;cursor:row-resize;";
			document.body.appendChild(overlay);
		},
		[height],
	);

	useEffect(() => {
		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);

		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);

			// Cleanup overlay if still present
			const overlay = document.getElementById("resize-overlay");
			if (overlay) overlay.remove();
		};
	}, [handleMouseMove, handleMouseUp]);

	return (
		<div
			className="absolute bottom-0 left-0 right-0 border-t border-zinc-800 bg-black flex flex-col"
			style={{ height: `${height}px` }}
		>
			{/* Resize Handle */}
			<div
				role="button"
				tabIndex={0}
				onMouseDown={handleMouseDown}
				className={cn(
					"absolute -top-2 left-0 right-0 h-2 cursor-row-resize z-50",
					"hover:bg-blue-500/50 transition-colors group",
				)}
				title="Drag to resize"
			>
				{/* Visual indicator on hover */}
				<div className="absolute left-1/2 top-0 -translate-x-1/2 w-12 h-2 bg-blue-500 opacity-0 group-hover:opacity-100 transition-all duration-200 rounded-full" />
			</div>

			{/* Results Content Area */}
			<div className="flex-1 overflow-auto">Query results will appear here</div>
		</div>
	);
};
