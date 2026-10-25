// PROTOTYPE — throwaway. Sidebar for /migrations: a Prisma tab listing `prisma/migrations`
// (pending on top in the order deploy runs them, history newest first) and a Comparisons tab
// with db-studio's own source → target diffs.
import { Input } from "@db-studio/ui/input";
import { cn } from "@db-studio/ui/utils";
import { Link, useSearch } from "@tanstack/react-router";
import { CircleCheck, CircleDashed, CircleX, FileX, Search } from "lucide-react";
import { useState } from "react";
import { ComparisonsList } from "./migrations-sidebar";
import {
	PRISMA_DIR,
	PRISMA_MIGRATIONS,
	type PrismaMigration,
	parseFolder,
	prismaSteps,
} from "./prisma-fixture";

const STATUS_ICON = {
	applied: CircleCheck,
	pending: CircleDashed,
	failed: CircleX,
	missing: FileX,
} satisfies Record<PrismaMigration["status"], typeof CircleCheck>;

const Item = ({ m, selected }: { m: PrismaMigration; selected: boolean }) => {
	const Icon = STATUS_ICON[m.status];
	const { name, created } = parseFolder(m.folder);
	const steps = m.sql ? prismaSteps(m.folder, m.sql) : [];
	const loss = steps.filter((s) => s.risk === "destructive").length;

	return (
		<Link
			to="/migrations"
			search={(prev) => ({ ...prev, view: "prisma", migration: m.folder })}
			className={cn(
				"flex gap-2 px-3 py-2 text-xs hover:bg-sidebar-accent/60",
				selected && "bg-sidebar-accent",
			)}
		>
			<Icon
				className={cn(
					"mt-0.5 size-3.5 shrink-0",
					m.status === "failed" ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
				)}
			/>
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline justify-between gap-2">
					<span className="truncate font-medium">{name}</span>
					<span className="shrink-0 tabular-nums text-muted-foreground">
						{steps.length || ""}
					</span>
				</div>
				<div className="mt-0.5 flex items-center justify-between gap-2 text-muted-foreground">
					<span className="truncate">{created}</span>
					{m.status === "failed" && (
						<span className="shrink-0 text-red-600 dark:text-red-400">failed</span>
					)}
					{m.edited && (
						<span className="shrink-0 text-amber-600 dark:text-amber-400">edited</span>
					)}
					{m.status === "missing" && <span className="shrink-0">file missing</span>}
					{m.status === "pending" && loss > 0 && (
						<span className="shrink-0 text-red-600 dark:text-red-400">{loss} loss</span>
					)}
				</div>
			</div>
		</Link>
	);
};

const PrismaList = () => {
	const { migration } = useSearch({ strict: false }) as { migration?: string };
	const [search, setSearch] = useState("");
	const visible = PRISMA_MIGRATIONS.filter((m) =>
		m.folder.toLowerCase().includes(search.toLowerCase()),
	);
	const groups = [
		["Pending", visible.filter((m) => m.status === "pending")],
		["History", visible.filter((m) => m.status !== "pending").reverse()],
	] as const;

	return (
		<>
			<div className="p-3 space-y-2 border-b border-sidebar-border">
				<p className="text-xs text-muted-foreground">
					<span className="font-mono text-foreground">{PRISMA_DIR}</span> ·{" "}
					{PRISMA_MIGRATIONS.length} migrations
				</p>
				<div className="relative">
					<Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
					<Input
						placeholder="Search migrations"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="rounded-sm h-8 pl-8"
					/>
				</div>
			</div>
			<div className="min-h-0 flex-1 overflow-auto pb-3">
				{groups.map(([title, items]) =>
					items.length === 0 ? null : (
						<section key={title}>
							<h3 className="px-3 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
								{title}
							</h3>
							{items.map((m) => (
								<Item
									key={m.folder}
									m={m}
									selected={m.folder === migration}
								/>
							))}
						</section>
					),
				)}
			</div>
		</>
	);
};

const TABS = [
	{ view: "prisma", label: "Prisma" },
	{ view: "compare", label: "Comparisons" },
] as const;

export const MigrationsPrototypeSidebar = () => {
	const { view = "prisma" } = useSearch({ strict: false }) as { view?: string };

	return (
		<>
			<div className="px-3 pt-3">
				<div className="flex h-8 rounded-md border border-sidebar-border text-xs">
					{TABS.map((t) => (
						<Link
							key={t.view}
							to="/migrations"
							search={{ view: t.view }}
							className={cn(
								"flex flex-1 items-center justify-center first:rounded-l-md last:rounded-r-md text-muted-foreground hover:text-foreground",
								view === t.view && "bg-sidebar-accent text-foreground font-medium",
							)}
						>
							{t.label}
						</Link>
					))}
				</div>
			</div>
			{view === "prisma" ? <PrismaList /> : <ComparisonsList />}
		</>
	);
};
