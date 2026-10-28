import type { ConnectionColorSchemaType } from "@db-studio/shared/types";
import { cn } from "@db-studio/ui/utils";
import { CONNECTION_COLOR_CLASSES } from "../constants";

export const ConnectionColorDot = ({
	color,
	className,
}: {
	color: ConnectionColorSchemaType | null;
	className?: string;
}) => (
	<span
		aria-hidden
		className={cn(
			"inline-block size-2.5 shrink-0 rounded-full",
			color ? CONNECTION_COLOR_CLASSES[color] : "border border-muted-foreground/50",
			className,
		)}
	/>
);
