// PROTOTYPE — throwaway. Comparisons tab of the /migrations sidebar: drafts on top, run history below.
import { Button } from "@db-studio/ui/button";
import { Input } from "@db-studio/ui/input";
import { cn } from "@db-studio/ui/utils";
import { Link, useSearch } from "@tanstack/react-router";
import { CircleCheck, CircleDashed, CircleX, GitCompareArrows, Search } from "lucide-react";
import { useState } from "react";
import {
	MIGRATIONS,
	type MigrationStatus,
	type ProtoMigration,
	STATUS_STYLE,
} from "./fixture";

const STATUS_ICON: Record<MigrationStatus, typeof CircleCheck> = {
	new: CircleDashed,
	draft: CircleDashed,
	applied: CircleCheck,
	failed: CircleX,
};

const Item = ({ m, selected }: { m: ProtoMigration; selected: boolean }) => {
	const Icon = STATUS_ICON[m.status];
	// Same answer the plan starts from: an unanswered rename counts as drop + add.
	const changes = m.changes(!m.askRename);
	const loss = changes.filter((c) => c.risk === "destructive").length;

	return (
		<Link
			to="/migrations"
			search={(prev) => ({ ...prev, view: "compare", migration: m.id })}
			className={cn(
				"flex gap-2 px-3 py-2 text-xs hover:bg-sidebar-accent/60",
				selected && "bg-sidebar-accent",
			)}
		>
			<Icon className={cn("mt-0.5 size-3.5 shrink-0", STATUS_STYLE[m.status])} />
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline justify-between gap-2">
					<span className={cn("truncate font-medium", m.status === "new" && "italic")}>
						{m.name}
					</span>
					<span className="shrink-0 tabular-nums text-muted-foreground">{changes.length}</span>
				</div>
				<div className="mt-0.5 flex items-center justify-between gap-2 text-muted-foreground">
					<span className="truncate">
						{m.from} → {m.to}
					</span>
					{loss > 0 && (m.status === "new" || m.status === "draft") && (
						<span className="shrink-0 text-red-600 dark:text-red-400">{loss} loss</span>
					)}
				</div>
				<div className="mt-0.5 text-muted-foreground/70">
					{m.status === "failed" ? `Failed · ${m.date}` : m.date}
				</div>
			</div>
		</Link>
	);
};

const Group = ({
	title,
	items,
	selected,
}: {
	title: string;
	items: ProtoMigration[];
	selected: string;
}) =>
	items.length === 0 ? null : (
		<section>
			<h3 className="px-3 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
				{title}
			</h3>
			{items.map((m) => (
				<Item
					key={m.id}
					m={m}
					selected={m.id === selected}
				/>
			))}
		</section>
	);

export const ComparisonsList = () => {
	const { migration = "m5" } = useSearch({ strict: false }) as { migration?: string };
	const [search, setSearch] = useState("");
	const visible = MIGRATIONS.filter(
		(m) =>
			(m.id !== "new" || migration === "new") &&
			`${m.name} ${m.from} ${m.to}`.toLowerCase().includes(search.toLowerCase()),
	);

	return (
		<>
			<div className="p-3 space-y-2 border-b border-sidebar-border">
				<Button
					asChild
					className="w-full justify-start h-8"
				>
					<Link
						to="/migrations"
						search={(prev) => ({ ...prev, view: "compare", migration: "new" })}
					>
						<GitCompareArrows className="size-4" />
						New comparison
					</Link>
				</Button>
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
				<Group
					title="Drafts"
					items={visible.filter((m) => m.status === "new" || m.status === "draft")}
					selected={migration}
				/>
				<Group
					title="History"
					items={visible.filter((m) => m.status === "applied" || m.status === "failed")}
					selected={migration}
				/>
			</div>
		</>
	);
};
