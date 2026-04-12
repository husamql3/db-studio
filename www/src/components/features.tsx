import { CodeIcon, DatabaseIcon, TableIcon, ZapIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Feature = {
	icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
	title: string;
	description: string;
};

const features: Feature[] = [
	{
		icon: ZapIcon,
		title: "Zero Installation",
		description: "Launch instantly with a single npx command. No setup required.",
	},
	{
		icon: DatabaseIcon,
		title: "Multi-Database",
		description: "First-class support for PostgreSQL and MySQL, with more coming.",
	},
	{
		icon: TableIcon,
		title: "Table Browser",
		description: "Browse, filter, sort, and paginate rows. Full CRUD without writing SQL.",
	},
	{
		icon: CodeIcon,
		title: "Query Editor",
		description: "Monaco-powered SQL editor with syntax highlighting built right in.",
	},
];

export function FeaturesGrid() {
	return (
		<div className="grid border-t grid-cols-1 sm:grid-cols-2">
			{features.map((feature, i) => (
				<FeatureCard
					key={feature.title}
					feature={feature}
					className={cn(
						i % 2 === 0 && "sm:border-r",
						i < 2 && "sm:border-b!",
						i < features.length - 1 && "border-b sm:border-b-0",
					)}
				/>
			))}
		</div>
	);
}

function FeatureCard({ feature, className }: { feature: Feature; className?: string }) {
	const Icon = feature.icon;

	return (
		<div
			className={cn(
				"group relative flex flex-col gap-3 px-6 py-8 bg-background transition-colors duration-200",
				"hover:bg-secondary/40 dark:hover:bg-secondary/20",
				"dark:bg-[radial-gradient(50%_80%_at_25%_0%,--theme(--color-foreground/.05),transparent)]",
				className,
			)}
		>
			<div className="flex items-center justify-center w-9 h-9 rounded-lg border border-border bg-secondary/60 dark:bg-secondary/30 text-foreground/70 group-hover:text-foreground transition-colors duration-200">
				<Icon
					className="size-4"
					strokeWidth={1.5}
				/>
			</div>

			<div className="flex flex-col gap-1">
				<h3 className="text-sm font-semibold text-foreground">{feature.title}</h3>
				<p className="text-xs text-muted-foreground leading-relaxed">{feature.description}</p>
			</div>
		</div>
	);
}
