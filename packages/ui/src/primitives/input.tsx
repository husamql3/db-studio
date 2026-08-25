import type * as React from "react";

import { cn } from "../utils";

type InputVariant = "default" | "outline";

function Input({
	className,
	type,
	variant = "default",
	...props
}: React.ComponentProps<"input"> & {
	variant?: InputVariant;
}) {
	return (
		<input
			type={type}
			data-slot="input"
			data-variant={variant}
			className={cn(
				"border-input focus-visible:border-ring focus-visible:ring-ring/30 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 h-7 rounded-sm border px-2 py-0.5 text-sm transition-colors file:h-6 file:text-xs/relaxed file:font-medium focus-visible:ring-[2px] aria-invalid:ring-[2px] md:text-xs/relaxed file:text-foreground placeholder:text-muted-foreground w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
				variant === "default" && "bg-input/20 dark:bg-input/30",
				variant === "outline" && "bg-transparent",
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
