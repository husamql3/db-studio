import { cn } from "@/lib/utils";

/** Eyebrow, title and optional lead shared by every page and homepage section. */
export const SectionHeader = ({
	eyebrow,
	title,
	description,
	level = 2,
	className,
}: {
	eyebrow: string;
	title: React.ReactNode;
	description?: React.ReactNode;
	level?: 1 | 2;
	className?: string;
}) => {
	const Heading = level === 1 ? "h1" : "h2";
	return (
		<header className={cn("flex flex-col gap-2 px-5 pt-10 pb-6 md:px-8", className)}>
			<p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
				{eyebrow}
			</p>
			<Heading
				className={cn(
					"font-medium tracking-tight text-balance",
					level === 1 ? "text-2xl md:text-3xl" : "text-lg md:text-xl",
				)}
			>
				{title}
			</Heading>
			{description && (
				<p className="max-w-xl text-sm leading-relaxed text-muted-foreground text-pretty">
					{description}
				</p>
			)}
		</header>
	);
};
