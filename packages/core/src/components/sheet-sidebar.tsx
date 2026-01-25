import type { ReactNode } from "react";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const SheetSidebar = ({
	title,
	description,
	side = "right",
	children,
	size = "sm:max-w-2xl!",
	headerClassName = "p-0 border-b border-zinc-800 p-3",
	titleClassName = "text-lg font-semibold",
	contentClassName = "px-5 py-6 space-y-6",
	open,
	onOpenChange,
	cta,
	closeButton = true,
}: {
	title?: string;
	description?: string;
	side?: "right" | "left";
	children: ReactNode;
	size?: string;
	headerClassName?: string;
	titleClassName?: string;
	contentClassName?: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	cta?: ReactNode;
	closeButton?: boolean;
}) => {
	return (
		<Sheet
			open={open}
			onOpenChange={onOpenChange}
		>
			<SheetContent
				side={side}
				className={size}
				showCloseButton={closeButton}
			>
				<SheetHeader className={headerClassName}>
					<SheetTitle className={cn(titleClassName, "flex justify-between items-center")}>
						{title}
						{cta}
					</SheetTitle>

					{description && (
						<SheetDescription className="text-xs/relaxed text-muted-foreground">
							{description}
						</SheetDescription>
					)}
				</SheetHeader>

				<div className={cn(contentClassName, "overflow-y-auto")}>{children}</div>
			</SheetContent>
		</Sheet>
	);
};
