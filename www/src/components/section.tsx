import { PlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Highlighter } from "./ui/highlighter";

export const Section = ({ children }: { children: React.ReactNode }) => {
	return (
		<div className="relative w-full flex flex-col border-y px-3 py-6 md:px-8 md:py-10 gap-6 md:gap-10">
			{children}
			{/* X Faded Borders & Shades */}
			<div
				aria-hidden="true"
				className="absolute inset-0 -z-1 size-full overflow-hidden"
			>
				<div
					className={cn(
						"absolute -inset-x-20 inset-y-0 z-0 rounded-full",
						"bg-[radial-gradient(ellipse_at_center,theme(--color-foreground/.1),transparent,transparent)]",
						"blur-[50px]",
					)}
				/>
				<div className="absolute inset-y-0 left-4 w-px bg-linear-to-b from-transparent via-border to-border md:left-8" />
				<div className="absolute inset-y-0 right-4 w-px bg-linear-to-b from-transparent via-border to-border md:right-8" />
				<div className="absolute inset-y-0 left-8 w-px bg-linear-to-b from-transparent via-border/50 to-border/50 md:left-12" />
				<div className="absolute inset-y-0 right-8 w-px bg-linear-to-b from-transparent via-border/50 to-border/50 md:right-12" />
			</div>

			<div className="w-full max-w-xl mx-auto">
				<div className="flex justify-center items-center mb-7 gap-2">
					<p className="text-center md:text-xl font-bold">
						A modern (pgAdmin alternative but good)
						<Highlighter
							action="highlight"
							color="oklch(0.488 0.243 264.376)"
						>
							database management studio
						</Highlighter>
						for any database
					</p>
				</div>

				<div className="flex flex-col mx-auto max-w-lg w-full">
					<div className="flex flex-col gap-1 text-center md:text-left">
						<h1 className="font-semibold">Getting Started</h1>
						<p className="text-xs text-muted-foreground">
							Run DB Studio directly in your terminal with a single command, no installation
							required.
						</p>
					</div>
				</div>

				<PlusIcon
					className="-top-[12.5px] -left-[12.5px] absolute h-6 w-6"
					strokeWidth={1}
				/>
				<PlusIcon
					className="-right-[12.5px] -top-[12.5px] absolute h-6 w-6"
					strokeWidth={1}
				/>
				<PlusIcon
					className="-bottom-[12.5px] -left-[12.5px] absolute h-6 w-6"
					strokeWidth={1}
				/>
				<PlusIcon
					className="-right-[12.5px] -bottom-[12.5px] absolute h-6 w-6"
					strokeWidth={1}
				/>
			</div>
		</div>
	);
};
