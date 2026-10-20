import { ArrowUpRightIcon, StarIcon } from "lucide-react";
import { useState } from "react";
import { IoLogoGithub } from "react-icons/io";
import { IoLogoNpm } from "react-icons/io5";
import { changelog } from "@/lib/content/changelog";
import { cn } from "@/lib/utils";
import type { getHomeStats, Week } from "@/utils/get-home-stats";

type HomeStatsData = Awaited<ReturnType<typeof getHomeStats>>;

const BRAND = "oklch(0.488 0.243 264.376)";
const REPO = "https://github.com/husamql3/db-studio";
const NPM = "https://www.npmjs.com/package/db-studio";

const compact = (n: number) =>
	new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

const fmtDay = (day: string, opts: Intl.DateTimeFormatOptions) =>
	new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { ...opts, timeZone: "UTC" });

/** Weekly downloads as an area chart, with the hovered week in a tooltip. */
function DownloadsChart({ weeks }: { weeks: Week[] }) {
	const [hover, setHover] = useState<number | null>(null);
	const W = 600;
	const H = 140;
	const peak = Math.max(1, ...weeks.map((w) => w.count));
	const step = W / Math.max(1, weeks.length - 1);
	const x = (i: number) => i * step;
	const y = (v: number) => H - (v / peak) * (H - 8);
	const line = weeks.map((w, i) => `${i ? "L" : "M"}${x(i)},${y(w.count)}`).join(" ");
	// A label at each month change, except at the edges where it would be clipped.
	const months = weeks.flatMap((w, i) =>
		i >= 2 && i <= weeks.length - 2 && w.start.slice(5, 7) !== weeks[i - 1].start.slice(5, 7)
			? [{ i, label: fmtDay(w.start, { month: "short" }) }]
			: [],
	);
	const h = hover === null ? null : weeks[hover];

	return (
		<div className="relative">
			<svg
				viewBox={`0 0 ${W} ${H}`}
				preserveAspectRatio="none"
				className="h-36 w-full touch-none"
				aria-hidden
				onPointerMove={(e) => {
					const box = e.currentTarget.getBoundingClientRect();
					const i = Math.round((((e.clientX - box.left) / box.width) * W) / step);
					setHover(Math.min(weeks.length - 1, Math.max(0, i)));
				}}
				onPointerLeave={() => setHover(null)}
			>
				<defs>
					<linearGradient
						id="downloads-fill"
						x1="0"
						x2="0"
						y1="0"
						y2="1"
					>
						<stop
							offset="0%"
							stopColor={BRAND}
							stopOpacity="0.4"
						/>
						<stop
							offset="100%"
							stopColor={BRAND}
							stopOpacity="0"
						/>
					</linearGradient>
				</defs>
				<path
					d={`${line} L${W},${H} L0,${H} Z`}
					fill="url(#downloads-fill)"
				/>
				<path
					d={line}
					fill="none"
					stroke={BRAND}
					strokeWidth="2"
					vectorEffect="non-scaling-stroke"
				/>
				{h && (
					<line
						x1={x(hover ?? 0)}
						x2={x(hover ?? 0)}
						y1={0}
						y2={H}
						stroke="currentColor"
						strokeOpacity="0.35"
						vectorEffect="non-scaling-stroke"
					/>
				)}
			</svg>

			{/* HTML, not SVG, so preserveAspectRatio="none" doesn't stretch them. */}
			{h && (
				<>
					<span
						className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background"
						style={{
							left: `${(x(hover ?? 0) / W) * 100}%`,
							top: `${(y(h.count) / H) * 100}%`,
							background: BRAND,
						}}
					/>
					<div
						className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-[11px] shadow-md"
						style={{ left: `${Math.min(88, Math.max(12, (x(hover ?? 0) / W) * 100))}%` }}
					>
						<span className="text-muted-foreground">
							Week of {fmtDay(h.start, { month: "short", day: "numeric" })}
						</span>{" "}
						<span className="tabular-nums">{h.count.toLocaleString()} downloads</span>
					</div>
				</>
			)}

			<div className="relative mt-1 h-4 text-[10px] text-muted-foreground">
				{months.map((m) => (
					<span
						key={m.i}
						className="absolute"
						style={{ left: `${(x(m.i) / W) * 100}%` }}
					>
						{m.label}
					</span>
				))}
			</div>
		</div>
	);
}

const cardClass = "flex flex-col gap-1 p-4";
const cardLabel = "flex items-center gap-1.5 whitespace-nowrap text-muted-foreground";

function LinkBadge({
	href,
	label,
	icon,
	iconClassName,
	children,
}: {
	href: string;
	label: string;
	icon: React.ReactNode;
	iconClassName: string;
	children: React.ReactNode;
}) {
	return (
		<a
			href={href}
			target="_blank"
			rel="noreferrer"
			aria-label={label}
			className="group flex items-stretch text-xs"
		>
			<span className={cn("flex items-center px-2", iconClassName)}>{icon}</span>
			<span className="flex items-center gap-1.5 border border-l-0 px-2.5 py-1.5 tabular-nums group-hover:bg-muted">
				{children}
				<ArrowUpRightIcon className="size-3 text-muted-foreground" />
			</span>
		</a>
	);
}

const NpmBadge = () => (
	<LinkBadge
		href={NPM}
		label={`db-studio v${changelog[0].version} on npm`}
		icon={<IoLogoNpm className="size-5" />}
		iconClassName="bg-[#CB3837] text-white"
	>
		v{changelog[0].version}
	</LinkBadge>
);

/** The big download count with its weekly chart, and badges on the right. */
function DownloadsOverview({
	stats,
	badges,
}: {
	stats: HomeStatsData;
	badges: React.ReactNode;
}) {
	return (
		<>
			<div className="flex flex-col gap-3 px-4 pt-6 md:px-8">
				<p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
					Built in public
				</p>
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div>
						<p className="text-5xl font-semibold tracking-tight tabular-nums">
							{stats.npmYearly.toLocaleString()}
						</p>
						<p className="mt-1 text-xs text-muted-foreground">
							npm downloads in the last 12 months
						</p>
					</div>
					<div className="flex flex-wrap gap-2">{badges}</div>
				</div>
			</div>

			<div className="px-4 pt-10 md:px-8">
				<DownloadsChart weeks={stats.npmWeeks} />
			</div>
		</>
	);
}

export function BuiltInPublic({ stats }: { stats: HomeStatsData }) {
	return (
		<div className="flex flex-col pb-4">
			<DownloadsOverview
				stats={stats}
				badges={
					<>
						<LinkBadge
							href={REPO}
							label={`${stats.stars} GitHub stars`}
							icon={<IoLogoGithub className="size-4" />}
							iconClassName="bg-foreground text-background"
						>
							<StarIcon className="size-3" />
							{stats.stars.toLocaleString()}
						</LinkBadge>
						<NpmBadge />
					</>
				}
			/>
		</div>
	);
}

/**
 * The full section, with stars and forks, page views and top referrers as cards under the chart.
 * Not rendered yet: swap it in for BuiltInPublic on the homepage once traffic is worth showing.
 */
export function HomeStats({ stats }: { stats: HomeStatsData }) {
	const { analytics } = stats;
	const referrers = analytics?.referrers.slice(0, 3) ?? [];
	const maxReferrer = referrers[0]?.views ?? 1;

	return (
		<div className="flex flex-col">
			<DownloadsOverview
				stats={stats}
				badges={<NpmBadge />}
			/>

			<div
				className={cn(
					"mt-4 grid divide-y border-t text-xs sm:divide-x sm:divide-y-0",
					analytics && (referrers.length ? "sm:grid-cols-3" : "sm:grid-cols-2"),
				)}
			>
				<a
					href={REPO}
					target="_blank"
					rel="noreferrer"
					className={cn(cardClass, "group hover:bg-muted")}
				>
					<span className={cardLabel}>
						<IoLogoGithub className="size-3.5" /> GitHub stars
					</span>
					<span className="flex items-baseline gap-2 tabular-nums">
						<span className="text-2xl">{stats.stars.toLocaleString()}</span>
						<span className="text-muted-foreground">· {stats.forks} forks</span>
					</span>
					<span className="mt-auto pt-1 text-muted-foreground group-hover:text-foreground">
						Star the repo →
					</span>
				</a>
				{analytics && (
					<div className={cardClass}>
						<span className={cardLabel}>Page views / 30d</span>
						<span className="text-2xl tabular-nums">{compact(analytics.pageViews)}</span>
					</div>
				)}
				{referrers.length > 0 && (
					<div className={cardClass}>
						<span className={cardLabel}>Top referrers</span>
						<ol className="flex flex-col gap-1.5">
							{referrers.map((r) => (
								<li
									key={r.name}
									className="relative flex justify-between gap-2 overflow-hidden rounded px-1.5 py-0.5"
								>
									<span
										className="absolute inset-y-0 left-0 rounded"
										style={{
											width: `${(r.views / maxReferrer) * 100}%`,
											background: BRAND,
											opacity: 0.18,
										}}
									/>
									<span className="relative truncate">{r.name}</span>
									<span className="relative text-muted-foreground tabular-nums">
										{compact(r.views)}
									</span>
								</li>
							))}
						</ol>
					</div>
				)}
			</div>
		</div>
	);
}
