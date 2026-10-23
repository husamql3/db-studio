import { useCopyButton } from "fumadocs-ui/utils/use-copy-button";
import { PlusIcon } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import {
	SPONSOR_EMAIL,
	type Sponsor,
	type SponsorTierId,
	sponsorLogoUrl,
	sponsorTiers,
} from "@/lib/content/sponsors";
import { cn } from "@/lib/utils";

// three.js is most of Silk's weight; loading it lazily keeps it out of the homepage bundle.
const Silk = lazy(() => import("@/components/silk").then((m) => ({ default: m.Silk })));

const CELL_HEIGHTS: Record<SponsorTierId, string> = {
	mythic: "h-40",
	legendary: "h-32",
	sponsor: "h-24",
	platform: "h-24",
};

const ACTION =
	"border bg-secondary/60 px-2.5 py-1 text-foreground/70 transition-colors duration-200 hover:text-foreground dark:bg-secondary/30";

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
			<div className={cell}>
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
				"group transition-colors duration-200 hover:bg-secondary/40 hover:text-foreground dark:hover:bg-secondary/20",
			)}
		>
			<span className="flex size-9 items-center justify-center border bg-secondary/60 text-foreground/70 transition-colors duration-200 group-hover:text-foreground dark:bg-secondary/30">
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
			{/* Same Silk settings as the roadmap header; the canvas paints behind this box. */}
			<div className="relative overflow-hidden">
				<Suspense>
					<Silk
						speed={4}
						scale={1}
						color="#222222"
						noiseIntensity={0.4}
						rotation={0}
					/>
				</Suspense>
				<h2 className="py-6 text-center font-medium text-lg text-muted-foreground tracking-tight md:text-xl">
					Open for <span className="text-foreground">sponsorship</span>
				</h2>
			</div>

			{sponsorTiers.map((tier) => {
				const inTier = sponsors.filter((s) => s.tier === tier.id);
				return (
					<div
						key={tier.id}
						className="border-t"
					>
						<div className="flex items-center justify-between border-b px-6 py-2.5 text-xs bg-background dark:bg-[radial-gradient(50%_80%_at_25%_0%,--theme(--color-foreground/.05),transparent)]">
							<h3 className="font-semibold text-foreground">{tier.label}</h3>
							<span className="text-muted-foreground">{tier.price}</span>
						</div>

						{/* One row per tier with borders only between cells: the section and tier
					    strips already draw every outer edge, and overlapping translucent
					    borders render thicker. */}
						<div className="grid grid-flow-col auto-cols-fr divide-x">
							{inTier.map((sponsor) => (
								<a
									key={sponsor.name}
									href={sponsor.url}
									target="_blank"
									// noopener only: noreferrer would hide the visit from the sponsor's analytics.
									rel="noopener"
									className={cn(
										"flex items-center justify-center font-semibold tracking-tight transition-colors duration-200",
										"hover:bg-secondary/40 dark:hover:bg-secondary/20",
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
							))}

							{Array.from({ length: Math.max(0, tier.spots - inTier.length) }, (_, i) => (
								<OpenSpot
									key={i}
									tier={tier.id}
								/>
							))}
						</div>
					</div>
				);
			})}

			<p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 border-t px-4 py-4 text-xs text-muted-foreground">
				Interested in sponsoring db-studio? Reach out at
				<a
					href={`mailto:${SPONSOR_EMAIL}`}
					className="underline underline-offset-4 hover:text-foreground"
				>
					{SPONSOR_EMAIL}
				</a>
			</p>
		</>
	);
}
