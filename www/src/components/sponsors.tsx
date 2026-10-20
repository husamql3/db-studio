import { PlusIcon } from "lucide-react";
import { lazy, Suspense } from "react";
import {
	SPONSOR_EMAIL,
	type Sponsor,
	type SponsorTierId,
	sponsorLogoUrl,
	sponsorMailto,
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
								<a
									key={i}
									href={sponsorMailto(tier)}
									className={cn(
										"group flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground transition-colors duration-200",
										"hover:bg-secondary/40 hover:text-foreground dark:hover:bg-secondary/20",
										CELL_HEIGHTS[tier.id],
									)}
								>
									<span className="flex size-9 items-center justify-center border bg-secondary/60 text-foreground/70 transition-colors duration-200 group-hover:text-foreground dark:bg-secondary/30">
										<PlusIcon
											className="size-4"
											strokeWidth={1.5}
										/>
									</span>
									{tier.id === "platform" ? "Offer your platform" : "Your logo here"}
								</a>
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
