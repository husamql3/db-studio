import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { cva, type VariantProps } from "class-variance-authority";
import { CheckIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/utils/cn";

const checkboxVariants = cva(
	"peer border-input dark:bg-input/30 data-[state=checked]:bg-primary data-[state=checked]:text-white dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
	{
		variants: {
			size: {
				sm: "size-3.5",
				default: "size-4",
				lg: "size-5",
			},
		},
		defaultVariants: {
			size: "default",
		},
	},
);

const checkboxIconVariants = cva("", {
	variants: {
		size: {
			sm: "size-2.5",
			default: "size-3.5",
			lg: "size-4",
		},
	},
	defaultVariants: {
		size: "default",
	},
});

interface CheckboxProps
	extends ComponentProps<typeof CheckboxPrimitive.Root>,
		VariantProps<typeof checkboxVariants> {}

function Checkbox({ className, size, ...props }: CheckboxProps) {
	return (
		<CheckboxPrimitive.Root
			data-slot="checkbox"
			className={cn(checkboxVariants({ size, className }))}
			{...props}
		>
			<CheckboxPrimitive.Indicator
				data-slot="checkbox-indicator"
				className="grid place-content-center text-current transition-none"
			>
				<CheckIcon className={cn(checkboxIconVariants({ size }))} />
			</CheckboxPrimitive.Indicator>
		</CheckboxPrimitive.Root>
	);
}

export { Checkbox };
