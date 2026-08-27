import { Button } from "@db-studio/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@db-studio/ui/tooltip";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

/**
 * Icon button that copies `text` (or its lazy producer) to the clipboard and
 * flashes a check mark. Used for key names, values, and JSON exports.
 */
export const RedisCopyButton = ({
	text,
	label,
	className,
}: {
	text: string | (() => string);
	label: string;
	className?: string;
}) => {
	const [copied, setCopied] = useState(false);
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon-sm"
					className={className}
					onClick={async () => {
						await navigator.clipboard.writeText(typeof text === "function" ? text() : text);
						setCopied(true);
						window.setTimeout(() => setCopied(false), 1_200);
					}}
					aria-label={label}
				>
					{copied ? <Check /> : <Copy />}
				</Button>
			</TooltipTrigger>
			<TooltipContent>{copied ? "Copied" : label}</TooltipContent>
		</Tooltip>
	);
};
