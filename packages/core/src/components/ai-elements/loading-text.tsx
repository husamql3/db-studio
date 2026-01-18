import * as Slot from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

type Variant = {
	variant: "shine";
	component: React.FC<React.ComponentProps<"span">>;
};

const variants = [
	{
		variant: "shine",
		component: ({ children, className, ...props }) => (
			<span
				{...props}
				className={cn(
					"bg-[linear-gradient(110deg,#bfbfbf,35%,#000,50%,#bfbfbf,75%,#bfbfbf)] dark:bg-[linear-gradient(110deg,#404040,35%,#fff,50%,#404040,75%,#404040)]",
					"bg-size-[200%_100%] bg-clip-text text-transparent",
					"animate-shine",
					className,
				)}
			>
				{children}
			</span>
		),
	},
] as const satisfies readonly Variant[];

export type TextProps = {
	variant?: (typeof variants)[number]["variant"];
} & React.ComponentProps<"span">;

export function LoadingText({
	variant = "shine",
	className,
	...props
}: TextProps) {
	const FALLBACK_INDEX = 0;

	const variantComponent = variants.find(
		(v) => v.variant === variant,
	)?.component;

	const Component = variantComponent || variants[FALLBACK_INDEX].component;

	return (
		<Slot.Root className={cn("font-medium text-sm")}>
			<Component
				{...props}
				className={className}
			/>
		</Slot.Root>
	);
}
