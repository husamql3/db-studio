import type { ReactNode } from "react";
import type { SheetName } from "@/stores/sheet.store";
import { useSheetStore } from "@/stores/sheet.store";
import { cn } from "@/utils/cn";

export const Sheet = ({
	children,
	className,
	title,
	name,
	width = 700,
}: {
	children: ReactNode;
	className?: string;
	title?: string;
	name: SheetName;
	width?: number;
}) => {
	const { closeSheet, isSheetOpen, getSheetIndex } = useSheetStore();
	const isOpen = isSheetOpen(name);
	const sheetIndex = getSheetIndex(name);

	// Calculate z-index based on position in stack (base z-50, increment by 10 for each sheet)
	const baseZIndex = 50;
	const zIndex = baseZIndex + sheetIndex * 10;

	return (
		<>
			{/* Background Overlay */}
			<div
				className={cn(
					"fixed inset-0 bg-black/70 transition-opacity duration-300",
					isOpen ? "opacity-100" : "opacity-0 pointer-events-none",
				)}
				style={{ zIndex: zIndex }}
				onClick={() => closeSheet(name)}
				tabIndex={0} // Use 0 so the overlay is in tab order and can be focused
				aria-label="Close sheet overlay"
				role="button"
			/>

			{/* Sheet Container */}
			<aside
				className={cn(
					"fixed right-0 top-0 bg-black border-l border-zinc-800 min-h-dvh",
					"transition-transform duration-300 ease-out shadow-lg transform-gpu",
					isOpen ? "translate-x-0" : "translate-x-full",
					className,
				)}
				style={{ zIndex: zIndex, width: `${width}px` }}
			>
				<div className="flex items-center justify-between border-b border-zinc-800 p-3">
					<h2 className="text-sm font-medium">{title}</h2>
				</div>

				{children}
			</aside>
		</>
	);
};
