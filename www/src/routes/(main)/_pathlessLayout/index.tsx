import { META } from "@db-studio/shared/constants";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IoLogoGithub } from "react-icons/io";
import { FeaturesGrid } from "@/components/features";
import { BuiltInPublic } from "@/components/home-stats";
import { InstallCommand } from "@/components/install-command";
import { SectionHeader } from "@/components/section";
import { SponsorsSection } from "@/components/sponsors";
import { Button } from "@/components/ui/btn";
import { ClickhouseIcon } from "@/components/ui/svgs/clickhouseIcon";
import { CockroachdbIcon } from "@/components/ui/svgs/cockroachdbIcon";
import { DuckdbIcon } from "@/components/ui/svgs/duckdbIcon";
import { MariadbIconDark } from "@/components/ui/svgs/mariadbIconDark";
import { MongodbWordmarkDark } from "@/components/ui/svgs/mongodbWordmarkDark";
import { MysqlWordmarkDark } from "@/components/ui/svgs/mysqlWordmarkDark";
import { OracleIcon } from "@/components/ui/svgs/oracleIcon";
import { PostgresqlWordmarkDark } from "@/components/ui/svgs/postgresqlWordmarkDark";
import { SQLite } from "@/components/ui/svgs/sqliteWordmark";
import { SqlServer } from "@/components/ui/svgs/sqlServer";
import { TidbIcon } from "@/components/ui/svgs/tidbIcon";
import { TursoWordmarkDark } from "@/components/ui/svgs/tursoWordmarkDark";
import { changelog } from "@/lib/content/changelog";
import { seoHead } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { getHomeStats } from "@/utils/get-home-stats";
import { getSponsors } from "@/utils/get-sponsors";

export const Route = createFileRoute("/(main)/_pathlessLayout/")({
	component: App,
	loader: async () => {
		const [stats, sponsors] = await Promise.all([getHomeStats(), getSponsors()]);
		return { stats, sponsors };
	},
	head: () =>
		seoHead({
			title: "db-studio | Every database. One studio",
			description:
				"dbstudio is a modern database client for PostgreSQL, MySQL, SQL Server, MongoDB, SQLite, Redis, DuckDB, Oracle, ClickHouse, and Turso. Browse tables, edit records, and run queries from one UI.",
			path: "/",
		}),
});

/** Engines whose brand ships an icon only; the grid pairs each with its name. */
const iconLogo = (name: string, Icon: typeof OracleIcon) => (
	<>
		<Icon
			aria-hidden="true"
			className="h-6 w-auto"
		/>
		<span className="text-lg font-semibold tracking-tight">{name}</span>
	</>
);

/** Engine logos, each linking to its section on /docs/databases. */
const LOGOS = [
	{
		slug: "postgresql",
		name: "PostgreSQL",
		logo: <PostgresqlWordmarkDark className="h-9 w-auto" />,
	},
	{ slug: "mysql", name: "MySQL", logo: <MysqlWordmarkDark className="h-9 w-auto" /> },
	{ slug: "mongodb", name: "MongoDB", logo: <MongodbWordmarkDark className="h-8 w-auto" /> },
	{ slug: "sql-server", name: "SQL Server", logo: iconLogo("SQL Server", SqlServer) },
	{ slug: "sqlite", name: "SQLite", logo: <SQLite className="h-9 w-auto" /> },
	{ slug: "turso", name: "Turso", logo: <TursoWordmarkDark className="h-7 w-auto" /> },
	{ slug: "mariadb", name: "MariaDB", logo: iconLogo("MariaDB", MariadbIconDark) },
	{ slug: "cockroachdb", name: "CockroachDB", logo: iconLogo("CockroachDB", CockroachdbIcon) },
	{ slug: "tidb", name: "TiDB", logo: iconLogo("TiDB", TidbIcon) },
	{ slug: "duckdb", name: "DuckDB", logo: iconLogo("DuckDB", DuckdbIcon) },
	{ slug: "oracle", name: "Oracle", logo: iconLogo("Oracle", OracleIcon) },
	{ slug: "clickhouse", name: "ClickHouse", logo: iconLogo("ClickHouse", ClickhouseIcon) },
];

// Plays from an effect, not autoPlay, so reduced-motion users keep the first frame.
function DemoVideo() {
	const videoRef = useRef<HTMLVideoElement>(null);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		// A cached video can load before hydration attaches onLoadedData.
		if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) setLoaded(true);
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		video.play().catch(() => {});
	}, []);

	return (
		<div className="relative aspect-video w-full">
			<video
				ref={videoRef}
				src="/demo.mp4"
				width={1920}
				height={1080}
				muted
				loop
				playsInline
				preload="auto"
				aria-label="db-studio feature tour"
				onLoadedData={() => setLoaded(true)}
				className="w-full h-full object-contain"
			/>
			{/* The pulse animates opacity, so the fade-out lives on the wrapper. */}
			<div
				aria-hidden
				className={cn(
					"absolute inset-0 transition-opacity duration-300 ease-out",
					loaded && "opacity-0 pointer-events-none",
				)}
			>
				<div className="size-full bg-muted animate-pulse" />
			</div>
		</div>
	);
}

function Hero({ stars }: { stars: number }) {
	const latest = changelog[0];
	return (
		<section className="relative overflow-hidden px-5 pt-16 pb-14 md:px-8 md:pt-24 md:pb-20">
			{/* A faint grid that fades out from the top-left corner, behind the copy. */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 opacity-50"
				style={{
					backgroundImage:
						"linear-gradient(to right, var(--color-border) 1px, transparent 1px), linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)",
					backgroundSize: "32px 32px",
					maskImage: "radial-gradient(ellipse 70% 90% at 0% 0%, black, transparent 70%)",
				}}
			/>

			<div className="stagger relative flex flex-col items-start gap-6">
				<Link
					to="/changelog"
					hash={`v${latest.version}`}
					className="group inline-flex h-7 max-w-full items-center gap-2 rounded-sm border bg-card pr-2.5 pl-1 text-xs text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
				>
					<span className="rounded-[3px] bg-brand/20 px-1.5 py-0.5 text-brand-light">
						v{latest.version}
					</span>
					<span className="truncate">{latest.title}</span>
					<ArrowRightIcon className="size-3 shrink-0 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
				</Link>

				<h1 className="max-w-3xl text-3xl leading-[1.1] font-semibold tracking-tight text-balance md:text-[2.625rem]">
					Every database. <span className="text-muted-foreground">One studio</span>
				</h1>

				<p className="max-w-xl text-sm leading-relaxed text-muted-foreground text-pretty">
					Browse tables, edit records, and run queries on PostgreSQL, MySQL, SQL Server,
					MongoDB, SQLite, Redis, DuckDB, Oracle, and ClickHouse from one UI. One command,
					nothing to install.
				</p>

				<InstallCommand />

				<div className="flex flex-wrap gap-2">
					<Button asChild>
						<Link
							to="/docs/$"
							params={{ _splat: "getting-started" }}
						>
							Read the docs
						</Link>
					</Button>
					<Button
						asChild
						variant="outline"
					>
						<a
							href={META.SITE_GITHUB_LINK}
							target="_blank"
							rel="noopener noreferrer"
						>
							<IoLogoGithub />
							Star on GitHub
							<span className="tabular-nums text-muted-foreground">
								{stars.toLocaleString()}
							</span>
						</a>
					</Button>
				</div>
			</div>
		</section>
	);
}

function App() {
	const { stats, sponsors } = Route.useLoaderData();
	return (
		<main className="mx-auto w-full max-w-5xl flex-1 border-x">
			<Hero stars={stats.stars} />

			<div className="border-t">
				<DemoVideo />
			</div>

			<section className="border-t">
				<SectionHeader
					eyebrow="Engines"
					title="Works with your stack"
					description="Every engine db-studio speaks, plus the databases built on their protocols. Pick one to see how to connect."
				/>
				<ul className="grid grid-cols-2 gap-px border-t bg-border sm:grid-cols-3 md:grid-cols-4">
					{LOGOS.map(({ slug, name, logo }) => (
						<li
							key={slug}
							className="bg-background"
						>
							<Link
								to="/docs/$"
								params={{ _splat: "databases" }}
								hash={slug}
								aria-label={`${name} docs`}
								className="group flex h-24 items-center justify-center px-4 transition-colors duration-200 hover:bg-white/[0.025]"
							>
								{/* brightness-0 + invert flattens the brand colors to white on the dark-only site. */}
								<span className="flex items-center gap-2 opacity-60 brightness-0 invert transition-opacity duration-200 group-hover:opacity-100">
									{logo}
								</span>
							</Link>
						</li>
					))}
				</ul>
			</section>

			<section className="border-t">
				<SectionHeader
					eyebrow="Features"
					title="Everything you need to manage your database"
				/>
				<FeaturesGrid />
			</section>

			<section className="border-t">
				{/* <HomeStats stats={stats} /> adds page views and referrers; use it once traffic grows. */}
				<BuiltInPublic stats={stats} />
			</section>

			<section className="border-t">
				<SectionHeader
					eyebrow="Sponsors"
					title="Open for sponsorship"
					description="db-studio is free and open source. Sponsors keep it that way."
				/>
				<SponsorsSection sponsors={sponsors} />
			</section>
		</main>
	);
}
