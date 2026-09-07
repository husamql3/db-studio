import { createFileRoute } from "@tanstack/react-router";
import {
	Activity,
	Database,
	Gauge,
	LogOut,
	RefreshCw,
	ShieldCheck,
	TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { AdminOverview } from "@/admin/analytics";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

export const Route = createFileRoute("/admin")({
	component: AdminPage,
	head: () => ({
		meta: [
			{ title: "Observability | DB Studio" },
			{ name: "robots", content: "noindex, nofollow, noarchive" },
		],
	}),
});

const ranges = [7, 30, 90] as const;
const chartConfig = {
	installations: { label: "Active installations", color: "#8b5cf6" },
	events: { label: "Events", color: "#22c55e" },
};

const statusColor = {
	available: "text-emerald-400",
	unconfigured: "text-amber-400",
	unavailable: "text-red-400",
};

function Login({ onSuccess }: { onSuccess: () => void }) {
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	return (
		<main className="flex min-h-dvh items-center justify-center bg-zinc-950 p-6">
			<form
				className="w-full max-w-sm space-y-5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-2xl"
				onSubmit={(event) => {
					event.preventDefault();
					setLoading(true);
					setError("");
					void fetch("/api/admin/login", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ password }),
					})
						.then(async (response) => {
							if (response.ok) return onSuccess();
							// Surface the server's reason: a rate limit reads very
							// differently from a wrong password.
							const body = (await response.json().catch(() => null)) as {
								error?: string;
							} | null;
							throw new Error(body?.error ?? `Sign in failed (${response.status})`);
						})
						.catch((reason: Error) => setError(reason.message))
						.finally(() => setLoading(false));
				}}
			>
				<div className="flex size-10 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400">
					<ShieldCheck className="size-5" />
				</div>
				<div>
					<h1 className="text-xl font-semibold text-zinc-50">DB Studio observability</h1>
					<p className="mt-1 text-sm text-zinc-400">Private maintainer access</p>
				</div>
				<label className="block text-sm text-zinc-300">
					Password
					<input
						type="password"
						autoComplete="current-password"
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none ring-violet-500 focus:ring-2"
						required
					/>
				</label>
				{error && <p className="text-sm text-red-400">{error}</p>}
				<button
					type="submit"
					disabled={loading}
					className="w-full rounded-md bg-violet-500 px-4 py-2 font-medium text-white hover:bg-violet-400 disabled:opacity-50"
				>
					{loading ? "Signing in…" : "Sign in"}
				</button>
			</form>
		</main>
	);
}

function MetricCard({
	label,
	value,
	icon: Icon,
}: {
	label: string;
	value: string;
	icon: typeof Activity;
}) {
	return (
		<div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
			<div className="flex items-center justify-between text-zinc-400">
				<span className="text-xs uppercase tracking-wide">{label}</span>
				<Icon className="size-4" />
			</div>
			<p className="mt-3 text-2xl font-semibold tabular-nums text-zinc-50">{value}</p>
		</div>
	);
}

function Breakdown({ title, items }: { title: string; items: AdminOverview["features"] }) {
	const max = Math.max(1, ...items.map((item) => item.value));
	return (
		<section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
			<h2 className="font-medium text-zinc-100">{title}</h2>
			<div className="mt-4 space-y-3">
				{items.length === 0 && <p className="text-sm text-zinc-500">No data yet.</p>}
				{items.slice(0, 10).map((item) => (
					<div key={item.name}>
						<div className="mb-1 flex justify-between gap-3 text-xs">
							<span className="truncate text-zinc-300">{item.name}</span>
							<span className="tabular-nums text-zinc-500">{item.value.toLocaleString()}</span>
						</div>
						<div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
							<div
								className="h-full rounded-full bg-violet-500"
								style={{ width: `${(item.value / max) * 100}%` }}
							/>
						</div>
					</div>
				))}
			</div>
		</section>
	);
}

function AdminPage() {
	const [range, setRange] = useState<(typeof ranges)[number]>(30);
	const [source, setSource] = useState("");
	const [engine, setEngine] = useState("");
	const [feature, setFeature] = useState("");
	const [release, setRelease] = useState("");
	const [overview, setOverview] = useState<AdminOverview>();
	const [unauthorized, setUnauthorized] = useState(false);
	const [loading, setLoading] = useState(true);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const params = new URLSearchParams({ range: String(range) });
			if (source) params.set("source", source);
			if (engine) params.set("engine", engine);
			if (feature) params.set("feature", feature);
			if (release) params.set("release", release);
			const response = await fetch(`/api/admin/overview?${params}`);
			if (response.status === 401) {
				setUnauthorized(true);
				return;
			}
			if (!response.ok) throw new Error("Dashboard data is unavailable");
			setOverview((await response.json()) as AdminOverview);
			setUnauthorized(false);
		} finally {
			setLoading(false);
		}
	}, [engine, feature, range, release, source]);

	useEffect(() => {
		void load();
	}, [load]);

	const lastUpdated = useMemo(
		() => (overview ? new Date(overview.generatedAt).toLocaleString() : "—"),
		[overview],
	);

	if (unauthorized) return <Login onSuccess={() => void load()} />;

	return (
		<main className="min-h-dvh bg-zinc-950 text-zinc-100">
			<div className="mx-auto max-w-7xl space-y-6 p-5 md:p-8">
				<header className="flex flex-col justify-between gap-4 border-b border-zinc-800 pb-6 md:flex-row md:items-center">
					<div>
						<p className="text-xs font-medium uppercase tracking-[0.2em] text-violet-400">
							DB Studio
						</p>
						<h1 className="mt-1 text-2xl font-semibold">Observability</h1>
						<p className="mt-1 text-xs text-zinc-500">Updated {lastUpdated}</p>
					</div>
					<div className="flex items-center gap-2">
						{ranges.map((value) => (
							<button
								type="button"
								key={value}
								onClick={() => setRange(value)}
								className={`rounded-md border px-3 py-1.5 text-xs ${range === value ? "border-violet-500 bg-violet-500/15 text-violet-300" : "border-zinc-800 text-zinc-400"}`}
							>
								{value}d
							</button>
						))}
						<button
							type="button"
							onClick={() => void load()}
							aria-label="Refresh"
							className="rounded-md border border-zinc-800 p-2 text-zinc-400"
						>
							<RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
						</button>
						<button
							type="button"
							onClick={() =>
								void fetch("/api/admin/logout", { method: "POST" }).then(() =>
									setUnauthorized(true),
								)
							}
							aria-label="Sign out"
							className="rounded-md border border-zinc-800 p-2 text-zinc-400"
						>
							<LogOut className="size-4" />
						</button>
					</div>
				</header>

				<div className="flex gap-4 text-xs">
					{overview &&
						Object.entries(overview.sources).map(([source, status]) => (
							<span
								key={source}
								className={statusColor[status]}
							>
								{source}: {status}
							</span>
						))}
				</div>

				<div className="grid gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:grid-cols-2 lg:grid-cols-4">
					<label className="text-xs text-zinc-400">
						Source
						<select
							value={source}
							onChange={(event) => setSource(event.target.value)}
							className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-zinc-200"
						>
							<option value="">All sources</option>
							<option value="client">Client</option>
							<option value="server">Server</option>
						</select>
					</label>
					<label className="text-xs text-zinc-400">
						Database engine
						<select
							value={engine}
							onChange={(event) => setEngine(event.target.value)}
							className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-zinc-200"
						>
							<option value="">All engines</option>
							{["pg", "mysql", "mssql", "mongodb", "sqlite", "redis"].map((value) => (
								<option
									key={value}
									value={value}
								>
									{value}
								</option>
							))}
						</select>
					</label>
					<label className="text-xs text-zinc-400">
						Feature
						<select
							value={feature}
							onChange={(event) => setFeature(event.target.value)}
							className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-zinc-200"
						>
							<option value="">All features</option>
							{[
								"db_connected",
								"db_selected",
								"query_executed",
								"record_created",
								"record_deleted",
								"record_exported",
								"table_created",
								"column_added",
								"bulk_insert",
								"chat_opened",
								"table_viewed",
							].map((value) => (
								<option
									key={value}
									value={value}
								>
									{value}
								</option>
							))}
						</select>
					</label>
					<label className="text-xs text-zinc-400">
						Release
						<select
							value={release}
							onChange={(event) => setRelease(event.target.value)}
							className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-zinc-200"
						>
							<option value="">All releases</option>
							{overview?.releases.map((item) => (
								<option
									key={item.name}
									value={item.name}
								>
									{item.name}
								</option>
							))}
						</select>
					</label>
				</div>

				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<MetricCard
						label="Active installations"
						value={(overview?.totals.activeInstallations ?? 0).toLocaleString()}
						icon={Database}
					/>
					<MetricCard
						label="Product events"
						value={(overview?.totals.events ?? 0).toLocaleString()}
						icon={Activity}
					/>
					<MetricCard
						label="Errors"
						value={(overview?.totals.errors ?? 0).toLocaleString()}
						icon={TriangleAlert}
					/>
					<MetricCard
						label="P95 latency"
						value={overview?.totals.p95Ms ? `${overview.totals.p95Ms} ms` : "—"}
						icon={Gauge}
					/>
				</div>

				<section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
					<h2 className="font-medium">Activity</h2>
					<ChartContainer
						config={chartConfig}
						className="mt-5"
					>
						<AreaChart
							data={overview?.activity ?? []}
							accessibilityLayer
						>
							<defs>
								<linearGradient
									id="fillInstallations"
									x1="0"
									y1="0"
									x2="0"
									y2="1"
								>
									<stop
										offset="5%"
										stopColor="var(--color-installations)"
										stopOpacity={0.45}
									/>
									<stop
										offset="95%"
										stopColor="var(--color-installations)"
										stopOpacity={0}
									/>
								</linearGradient>
							</defs>
							<CartesianGrid
								vertical={false}
								stroke="#27272a"
							/>
							<XAxis
								dataKey="date"
								tickLine={false}
								axisLine={false}
								tickFormatter={(value) => String(value).slice(5)}
							/>
							<YAxis
								tickLine={false}
								axisLine={false}
								width={32}
							/>
							<ChartTooltip content={<ChartTooltipContent />} />
							<Area
								type="monotone"
								dataKey="installations"
								stroke="var(--color-installations)"
								fill="url(#fillInstallations)"
								strokeWidth={2}
							/>
						</AreaChart>
					</ChartContainer>
				</section>

				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
					<Breakdown
						title="Features"
						items={overview?.features ?? []}
					/>
					<Breakdown
						title="Database engines"
						items={overview?.engines ?? []}
					/>
					<Breakdown
						title="Releases"
						items={overview?.releases ?? []}
					/>
					<Breakdown
						title="Errors by source"
						items={overview?.errorsBySource ?? []}
					/>
				</div>

				<div className="flex gap-4 text-xs text-zinc-500">
					<a
						className="hover:text-zinc-200"
						href="https://husamql3.sentry.io"
						target="_blank"
						rel="noreferrer"
					>
						Open Sentry ↗
					</a>
					<a
						className="hover:text-zinc-200"
						href="https://eu.posthog.com/project/267671/dashboard/936971"
						target="_blank"
						rel="noreferrer"
					>
						Open PostHog ↗
					</a>
				</div>
			</div>
		</main>
	);
}
