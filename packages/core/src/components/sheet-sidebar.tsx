import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export const SheetSidebar = ({
	title,
	side = "right",
	children,
	size = "sm:max-w-2xl!",
	headerClassName = "p-0 border-b border-zinc-800",
	titleClassName = "text-lg font-semibold p-3",
	contentClassName = "px-5 py-6 space-y-6",
	open,
	onOpenChange,
}: {
	title?: string;
	side?: "right" | "left";
	children: ReactNode;
	size?: string;
	headerClassName?: string;
	titleClassName?: string;
	contentClassName?: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) => {
	return (
		<Sheet
			open={open}
			onOpenChange={onOpenChange}
		>
			<SheetContent
				side={side}
				className={size}
			>
				<SheetHeader className={headerClassName}>
					<SheetTitle className={titleClassName}>{title}</SheetTitle>
				</SheetHeader>

				<div className={contentClassName}>{children}</div>
			</SheetContent>
		</Sheet>
	);
};
