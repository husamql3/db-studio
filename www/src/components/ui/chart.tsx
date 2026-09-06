import { ResponsiveContainer, Tooltip, type TooltipContentProps } from "recharts";
import { cn } from "@/lib/utils";

export type ChartConfig = Record<string, { label: string; color: string }>;

export const ChartContainer = ({
	config,
	className,
	children,
}: {
	config: ChartConfig;
	className?: string;
	children: React.ReactElement;
}) => (
	<div
		className={cn("h-72 w-full text-xs", className)}
		style={Object.fromEntries(
			Object.entries(config).map(([key, value]) => [`--color-${key}`, value.color]),
		)}
	>
		<ResponsiveContainer>{children}</ResponsiveContainer>
	</div>
);

export const ChartTooltip = Tooltip;

export const ChartTooltipContent = ({
	active,
	payload,
	label,
}: TooltipContentProps<number, string>) => {
	if (!active || !payload?.length) return null;
	return (
		<div className="min-w-36 rounded-lg border border-zinc-700 bg-zinc-950 p-2 shadow-xl">
			<p className="mb-1 text-zinc-400">{String(label)}</p>
			{payload.map((item) => (
				<div
					key={item.dataKey}
					className="flex items-center justify-between gap-5"
				>
					<span style={{ color: item.color }}>{item.name}</span>
					<span className="font-medium tabular-nums text-zinc-100">
						{Number(item.value).toLocaleString()}
					</span>
				</div>
			))}
		</div>
	);
};
