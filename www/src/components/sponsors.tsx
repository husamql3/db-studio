import { useCopyButton } from "fumadocs-ui/utils/use-copy-button";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import {
	SPONSOR_EMAIL,
	type Sponsor,
	type SponsorTierId,
	sponsorLogoUrl,
	sponsorTiers,
} from "@/lib/content/sponsors";
import { cn } from "@/lib/utils";

const CELL_HEIGHTS: Record<SponsorTierId, string> = {
	mythic: "h-48",
	legendary: "h-40",
	sponsor: "h-32",
	platform: "h-32",
};

const ACTION =
	"cursor-pointer rounded-sm border bg-white/[0.03] px-2.5 py-1 text-foreground/70 transition-[color,transform] duration-150 ease-out hover:text-foreground active:scale-[0.97]";

// Module-level so React calls it once on mount, not again on each re-render.
const focusOnMount = (el: HTMLElement | null) => el?.focus();

/** An empty slot; clicking it swaps the plus for the two ways to get in touch. */
function OpenSpot({ tier }: { tier: SponsorTierId }) {
	const [open, setOpen] = useState(false);
	const [copied, copy] = useCopyButton(() => navigator.clipboard.writeText(SPONSOR_EMAIL));
	const cell = cn(
		"flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground",
		CELL_HEIGHTS[tier],
	);

	if (open) {
		return (
			<div className={cn(cell, "animate-in fade-in-0 duration-200")}>
				<button
					type="button"
					// The slot button that had focus is gone, so hand focus to the first choice.
					ref={focusOnMount}
					onClick={copy}
					aria-live="polite"
					className={ACTION}
				>
					{copied ? "Copied" : "Copy email"}
				</button>
				<a
					href="https://x.com/husamql3"
					target="_blank"
					rel="noopener noreferrer"
					className={ACTION}
				>
					Message on X
				</a>
			</div>
		);
	}

	return (
		<button
			type="button"
			onClick={() => setOpen(true)}
			className={cn(
				cell,
				"group w-full cursor-pointer transition-colors duration-150 hover:bg-white/[0.02] hover:text-foreground",
			)}
		>
			<span className="flex size-7 items-center justify-center rounded-sm border bg-white/[0.03] text-foreground/70 transition-colors duration-150 group-hover:text-foreground">
				<PlusIcon
					className="size-4"
					strokeWidth={1.5}
				/>
			</span>
			{tier === "platform" ? "Offer your platform" : "Your logo here"}
		</button>
	);
}

export function SponsorsSection({ sponsors }: { sponsors: Sponsor[] }) {
	return (
		<>
			{sponsorTiers.map((tier) => {
				const inTier = sponsors.filter((s) => s.tier === tier.id);
				return (
					<div
						key={tier.id}
						className="border-t"
					>
						<div className="flex items-center justify-between border-b bg-white/[0.015] px-5 py-2 text-xs md:px-8">
							<h3 className="font-medium text-foreground">{tier.label}</h3>
							<span className="tabular-nums text-muted-foreground">{tier.price}</span>
						</div>

						{/* One row per tier. gap-px over a border-colored grid draws one hairline between
						    cells; the tier strips already draw the outer edges. Cells sit on bg-background so
						    their translucent hover doesn't let the lines through. */}
						<div
							className="grid grid-cols-(--cols) gap-px bg-border"
							style={
								{ "--cols": `repeat(${tier.spots}, minmax(0, 1fr))` } as React.CSSProperties
							}
						>
							{inTier.map((sponsor) => (
								<div
									key={sponsor.id}
									className="bg-background"
								>
									<a
										href={sponsor.url}
										target="_blank"
										// noopener only: noreferrer would hide the visit from the sponsor's analytics.
										rel="noopener"
										className={cn(
											"flex items-center justify-center font-semibold tracking-tight transition-colors duration-200",
											"hover:bg-white/[0.02]",
											tier.id === "mythic"
												? "text-2xl bg-[radial-gradient(60%_90%_at_50%_0%,oklch(0.488_0.243_264.376/.15),transparent)]"
												: "text-sm dark:bg-[radial-gradient(50%_80%_at_50%_0%,--theme(--color-foreground/.05),transparent)]",
											CELL_HEIGHTS[tier.id],
										)}
									>
										{sponsor.logo ? (
											<img
												src={sponsorLogoUrl(sponsor)}
												alt={sponsor.name}
												className={cn(
													"w-auto max-w-[70%] object-contain",
													tier.id === "mythic" ? "h-12" : "h-7",
												)}
											/>
										) : (
											sponsor.name
										)}
									</a>
								</div>
							))}

							{Array.from({ length: Math.max(0, tier.spots - inTier.length) }, (_, i) => (
								<div
									key={i}
									className="bg-background"
								>
									<OpenSpot tier={tier.id} />
								</div>
							))}
						</div>
					</div>
				);
			})}

			<p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 border-t px-4 py-4 text-xs text-muted-foreground">
				Interested in sponsoring db-studio? Reach out at
				<a
					href={`mailto:${SPONSOR_EMAIL}`}
					className="underline underline-offset-4 transition-colors duration-150 hover:text-foreground"
				>
					{SPONSOR_EMAIL}
				</a>
			</p>
		</>
	);
}
