import { buttonVariants } from "@db-studio/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@db-studio/ui/tooltip";
import { cn } from "@db-studio/ui/utils";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

const VARIANTS = {
	cell: cn(
		"absolute right-0.5 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center [&_svg]:size-3.5",
		"text-muted-foreground opacity-0 transition-opacity",
		"hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none",
		"group-hover:opacity-100",
	),
	ghost: buttonVariants({ variant: "ghost", size: "icon-sm" }),
	outline:
		"inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-3.5",
};

const ICON_TRANSITION =
	"transition-[opacity,scale,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)]";

/**
 * Copies `value`, or what `getValue` returns at click time, and flashes a check mark.
 * An empty `value` renders nothing.
 */
export const CopyButton = ({
	value = "",
	getValue,
	label = "Copy",
	copiedLabel = "Copied",
	variant = "cell",
	tooltip = false,
	className,
}: {
	value?: string;
	getValue?: () => string;
	label?: string;
	copiedLabel?: string;
	variant?: keyof typeof VARIANTS;
	tooltip?: boolean;
	className?: string;
}) => {
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!copied) return;
		const timeout = window.setTimeout(() => setCopied(false), 1200);

		return () => window.clearTimeout(timeout);
	}, [copied]);

	if (!getValue && value === "") return null;

	const button = (
		<button
			type="button"
			className={cn(VARIANTS[variant], className)}
			aria-label={copied ? copiedLabel : label}
			onClick={async (event) => {
				event.stopPropagation();

				try {
					await navigator.clipboard.writeText(getValue ? getValue() : value);
				} catch {
					return;
				}

				setCopied(true);
			}}
		>
			<span className="relative inline-flex items-center justify-center">
				<Copy
					className={cn(
						ICON_TRANSITION,
						copied ? "scale-25 opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-[0px]",
					)}
				/>
				<Check
					className={cn(
						"absolute inset-0",
						ICON_TRANSITION,
						copied ? "scale-100 opacity-100 blur-[0px]" : "scale-25 opacity-0 blur-[4px]",
					)}
				/>
			</span>
		</button>
	);

	if (!tooltip) return button;

	return (
		<Tooltip>
			<TooltipTrigger asChild>{button}</TooltipTrigger>
			<TooltipContent>{copied ? copiedLabel : label}</TooltipContent>
		</Tooltip>
	);
};
