import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@db-studio/ui/sheet";
import { cn } from "@db-studio/ui/utils";
import type { ComponentProps, ReactNode } from "react";

export const SheetSidebar = ({
	title,
	description,
	side = "right",
	children,
	size = "sm:max-w-2xl!",
	headerClassName = "p-0 border-b border-border p-3",
	titleClassName = "text-lg font-semibold",
	contentClassName = "px-5 py-6 space-y-6",
	open,
	onOpenChange,
	cta,
	closeButton = true,
	modal = true,
	onFocusOutside,
	onPointerDownOutside,
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
	/** Non-modal sheets keep the page behind them interactive and undimmed. */
	modal?: boolean;
	onFocusOutside?: ComponentProps<typeof SheetContent>["onFocusOutside"];
	onPointerDownOutside?: ComponentProps<typeof SheetContent>["onPointerDownOutside"];
}) => {
	return (
		<Sheet
			open={open}
			onOpenChange={onOpenChange}
			modal={modal}
		>
			<SheetContent
				side={side}
				className={size}
				showCloseButton={closeButton}
				showOverlay={modal}
				onFocusOutside={onFocusOutside}
				onPointerDownOutside={onPointerDownOutside}
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
