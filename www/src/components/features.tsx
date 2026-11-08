import {
	BookmarkIcon,
	CodeIcon,
	DatabaseIcon,
	SparklesIcon,
	TableIcon,
	ZapIcon,
} from "lucide-react";

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
		description:
			"PostgreSQL, MySQL, SQL Server, MongoDB, SQLite, Redis, DuckDB, Oracle, ClickHouse, and more from one UI.",
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
	{
		icon: BookmarkIcon,
		title: "Saved Connections",
		description:
			"Every database you open is remembered. Switch, rename, and color connections without leaving the app.",
	},
	{
		icon: SparklesIcon,
		title: "AI Assistant",
		description:
			"Ask about your schema and draft queries in chat, with your own AI provider key.",
	},
];

// gap-px over a border-colored grid draws one hairline between cells, never a doubled edge.
export function FeaturesGrid() {
	return (
		<div className="grid gap-px border-t bg-border sm:grid-cols-2 lg:grid-cols-3">
			{features.map(({ icon: Icon, title, description }) => (
				<div
					key={title}
					className="flex flex-col gap-2 bg-background px-5 py-6 md:px-8"
				>
					<h3 className="flex items-center gap-2 text-sm font-medium">
						<Icon
							className="size-4 text-muted-foreground"
							strokeWidth={1.5}
						/>
						{title}
					</h3>
					<p className="text-xs leading-relaxed text-muted-foreground text-pretty">
						{description}
					</p>
				</div>
			))}
		</div>
	);
}
