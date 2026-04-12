import { cn } from "@/lib/utils";

type Logo = {
	src: string;
	alt: string;
};

export function LogoCloud() {
	return (
		<div className="grid border-t grid-cols-2 ">
			<LogoCard
				className="relative border-r bg-secondary dark:bg-secondary/30"
				logo={{
					src: "https://storage.efferd.com/logo/supabase-wordmark.svg",
					alt: "Supabase Logo",
				}}
			></LogoCard>

			<LogoCard
				logo={{
					src: "https://storage.efferd.com/logo/github-wordmark.svg",
					alt: "GitHub Logo",
				}}
			/>
		</div>
	);
}

type LogoCardProps = React.ComponentProps<"div"> & {
	logo: Logo;
};

function LogoCard({ logo, className, children, ...props }: LogoCardProps) {
	return (
		<div
			className={cn(
				"flex items-center justify-center bg-background px-4 py-8 md:p-8",
				className,
			)}
			{...props}
		>
			<img
				alt={logo.alt}
				className="pointer-events-none h-4 select-none md:h-5 dark:brightness-0 dark:invert"
				height="auto"
				src={logo.src}
				width="auto"
			/>
			{children}
		</div>
	);
}
