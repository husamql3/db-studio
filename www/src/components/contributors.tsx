import { cn } from "@/lib/utils";
import type { Contributor } from "@/utils/get-contributors";

export function ContributorsGrid({ contributors }: { contributors: Contributor[] }) {
	if (contributors.length === 0) return null;

	const cols = Math.min(contributors.length, 4);
	const total = contributors.length;
	const rows = Math.ceil(total / cols);

	return (
		<div
			className="grid border-t"
			style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
		>
			{contributors.map((contributor, i) => {
				const row = Math.floor(i / cols);

				return (
					<ContributorCard
						key={contributor.login}
						contributor={contributor}
						className={cn(
							cols > 1 && i % cols !== cols - 1 && "border-r",
							cols > 1 && row < rows - 1 && "border-b",
						)}
					/>
				);
			})}
		</div>
	);
}

function ContributorCard({
	contributor,
	className,
}: {
	contributor: Contributor;
	className?: string;
}) {
	return (
		<a
			href={contributor.profileUrl}
			target="_blank"
			rel="noopener noreferrer"
			className={cn(
				"group flex flex-col items-center gap-2 px-4 py-6 bg-background transition-colors duration-200 hover:bg-secondary/40 dark:hover:bg-secondary/20",
				className,
			)}
		>
			<img
				src={contributor.avatarUrl}
				alt={contributor.login}
				width={40}
				height={40}
				className="rounded-full size-10 ring-1 ring-border group-hover:ring-foreground/30 transition-all duration-200"
			/>
			<span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors duration-200 truncate max-w-full">
				{contributor.login}
			</span>
		</a>
	);
}
