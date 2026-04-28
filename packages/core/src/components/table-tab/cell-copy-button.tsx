import { Check, Copy } from "lucide-react";
import { type MouseEvent, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { formatCellValue } from "@/utils/format-cell-value";

export const CellCopyButton = ({
	value,
	className,
}: {
	value: unknown;
	className?: string;
}) => {
	const [copied, setCopied] = useState(false);
	const resetCopyTimeoutRef = useRef<number | null>(null);

	useEffect(() => {
		return () => {
			if (resetCopyTimeoutRef.current) {
				window.clearTimeout(resetCopyTimeoutRef.current);
			}
		};
	}, []);

	const formattedValue = formatCellValue(value);

	const handleCopy = useCallback(
		async (event: MouseEvent<HTMLButtonElement>) => {
			event.stopPropagation();
			try {
				await navigator.clipboard.writeText(formattedValue);
				setCopied(true);
			} catch (error) {
				console.error("Failed to copy cell value:", error);
				return;
			}

			if (resetCopyTimeoutRef.current) {
				window.clearTimeout(resetCopyTimeoutRef.current);
			}
			resetCopyTimeoutRef.current = window.setTimeout(() => {
				setCopied(false);
			}, 1200);
		},
		[formattedValue],
	);

	if (!formattedValue) return null;

	return (
		<button
			type="button"
			className={cn(
				"absolute right-0.5 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center",
				"text-muted-foreground opacity-0 transition-opacity",
				"hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none",
				"group-hover:opacity-100",
				className,
			)}
			onClick={handleCopy}
			aria-label={copied ? "Copied" : "Copy"}
		>
			{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
		</button>
	);
};
