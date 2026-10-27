// PROTOTYPE — throwaway. /migrations?view=prisma: the project's Prisma migrations on the
// timeline. Each migration is a node on the main line; the line swings out through its
// statements. HEAD marks how far the connected database is; everything below it is pending.
// Read-only: db-studio shows what Prisma will do and the command to run, it never applies.
import { Button } from "@db-studio/ui/button";
import { cn } from "@db-studio/ui/utils";
import { Check, Copy, FolderOpen, RefreshCw } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { RISK_STYLE } from "./fixture";
import {
	PRISMA_COMMANDS,
	PRISMA_DIR,
	PRISMA_MIGRATIONS,
	PRISMA_PROVIDER,
	PRISMA_TARGET,
	type PrismaMigration,
	parseFolder,
	prismaSteps,
	prismaWarnings,
} from "./prisma-fixture";
import { Gutter, type GutterSpec, RefPill, StepBody, type StepState } from "./steps-shared";
import { STEP_LANE, Swing } from "./steps-timeline";

const LINE = "var(--muted-foreground)";
const PENDING_LINE = "color-mix(in oklab, var(--muted-foreground) 40%, transparent)";
const NODE = "var(--foreground)";
const RED = "#ef4444";

const toolbarButton =
	"h-8! px-2.5 border-l border-y-0 border-r-0 border-border rounded-none text-xs font-medium gap-1.5 flex items-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors";

const CopyCommand = ({ command }: { command: string }) => {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			className="group mt-1.5 flex w-full items-center gap-2 rounded border border-border bg-muted/30 px-2 py-1 text-left font-mono text-[11px] hover:bg-muted/60"
			onClick={() => {
				navigator.clipboard.writeText(command);
				setCopied(true);
				setTimeout(() => setCopied(false), 1200);
			}}
		>
			<span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{command}</span>
			{copied ? (
				<Check className="size-3.5 shrink-0" />
			) : (
				<Copy className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />
			)}
		</button>
	);
};

const Note = ({
	tone,
	children,
}: {
	tone: "red" | "amber" | "muted";
	children: ReactNode;
}) => (
	<div
		className={cn(
			"mt-1 mb-2 rounded border px-2.5 py-2 text-xs",
			tone === "red" && "border-red-500/40 bg-red-500/5",
			tone === "amber" && "border-amber-500/40 bg-amber-500/5",
			tone === "muted" && "border-border bg-muted/20 text-muted-foreground",
		)}
	>
		{children}
	</div>
);

const STATUS_LABEL: Record<PrismaMigration["status"], ReactNode> = {
	applied: <span className="text-muted-foreground">applied</span>,
	pending: <span className="text-muted-foreground">pending</span>,
	failed: <span className={RISK_STYLE.destructive}>failed</span>,
	missing: <span className="text-muted-foreground">file missing</span>,
};

/** "step 1" / "steps 1–3": the statements a failed migration left applied. */
const ranSteps = (m: PrismaMigration) =>
	m.appliedSteps === 1 ? "step 1" : `steps 1–${m.appliedSteps}`;

const stepState = (m: PrismaMigration, index: number): StepState => {
	if (m.status === "applied") return "done";
	if (m.status === "pending") return "pending";
	const ran = m.appliedSteps ?? 0;
	return index < ran ? "done" : index === ran ? "failed" : "skipped";
};

export const PrismaScreen = ({ selected }: { selected?: string }) => {
	const [open, setOpen] = useState<Set<string>>(new Set());
	const [scannedAt, setScannedAt] = useState("just now");

	useEffect(() => {
		if (selected)
			document
				.getElementById(`mig-${selected}`)
				?.scrollIntoView({ block: "center", behavior: "smooth" });
	}, [selected]);

	const migrations = PRISMA_MIGRATIONS;
	const pending = migrations.filter((m) => m.status === "pending");
	const failed = migrations.filter((m) => m.status === "failed");
	const edited = migrations.filter((m) => m.edited);
	const missing = migrations.filter((m) => m.status === "missing");
	const pendingSteps = pending.flatMap((m) => prismaSteps(m.folder, m.sql ?? ""));
	const pendingLoss = pendingSteps.filter((s) => s.risk === "destructive").length;
	// Pending migrations always sort after everything the database has seen.
	const headIndex = migrations.length - pending.length - 1;

	const toggle = (id: string) =>
		setOpen((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});

	const rows: ReactNode[] = [];
	migrations.forEach((m, i) => {
		const isPending = m.status === "pending";
		const line = isPending ? PENDING_LINE : LINE;
		const steps = m.sql ? prismaSteps(m.folder, m.sql) : [];
		const warnings = m.sql ? prismaWarnings(m.sql) : [];
		const loss = steps.filter((s) => s.risk === "destructive").length;
		const review = steps.filter((s) => s.risk === "review").length;
		const { name, created } = parseFolder(m.folder);
		const isLast = i === migrations.length - 1;

		const spec: GutterSpec = {
			lanes: 1,
			segments: [
				...(i > 0 ? [{ lane: 0, color: line, span: "top" as const }] : []),
				{ lane: 0, color: line, span: "bottom" },
			],
			dot: {
				lane: 0,
				color: m.status === "failed" ? RED : isPending ? LINE : NODE,
				shape:
					m.status === "failed"
						? "failed"
						: m.status === "missing"
							? "skipped"
							: isPending
								? "start"
								: "merge",
			},
		};

		rows.push(
			<li
				key={m.folder}
				id={`mig-${m.folder}`}
				className={cn("flex scroll-mt-4 rounded", selected === m.folder && "bg-muted/50")}
			>
				<Gutter spec={spec} />
				<div className="min-w-0 flex-1 px-2 text-xs">
					<div className="h-8 flex items-center gap-2">
						<span className="truncate font-medium">{name}</span>
						{STATUS_LABEL[m.status]}
						{m.edited && <RefPill>edited after it ran</RefPill>}
						<span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
							{steps.length > 0 && `${steps.length} ${steps.length === 1 ? "step" : "steps"}`}
						</span>
						{isPending && review > 0 && (
							<span className={RISK_STYLE.review}>{review} review</span>
						)}
						{isPending && loss > 0 && (
							<span className={RISK_STYLE.destructive}>{loss} data loss</span>
						)}
					</div>
					<div className="-mt-1.5 mb-1 font-mono text-[11px] text-muted-foreground">
						{m.folder.slice(0, 14)} · created {created}
						{m.finishedAt && ` · applied ${m.finishedAt} in ${m.durationMs} ms`}
					</div>
					{m.status === "failed" && (
						<Note tone="red">
							<p className="font-medium text-red-600 dark:text-red-400">
								Stopped at step {(m.appliedSteps ?? 0) + 1} of {steps.length}
							</p>
							<pre className="mt-1 whitespace-pre-wrap font-mono text-[11px]">{m.logs}</pre>
							<p className="mt-1.5 text-muted-foreground">
								Prisma does not wrap a migration in a transaction, so {ranSteps(m)}{" "}
								{m.appliedSteps === 1 ? "stays" : "stay"} applied.
							</p>
						</Note>
					)}
					{m.edited && (
						<Note tone="amber">
							This file changed after it ran: its checksum no longer matches{" "}
							<code>_prisma_migrations</code>. <code>prisma migrate dev</code> will flag it.
							Put the original back and make the change in a new migration.
						</Note>
					)}
					{m.status === "missing" && (
						<Note tone="muted">
							<code>_prisma_migrations</code> says this ran on {m.finishedAt}, but its folder
							is not in <code>{PRISMA_DIR}</code>. Restore it from git, or{" "}
							<code>prisma migrate dev</code> will report drift.
						</Note>
					)}
					{warnings.length > 0 && (
						<Note tone="red">
							<p className="font-medium">Prisma warns</p>
							{warnings.map((w) => (
								<p key={w}>{w}</p>
							))}
						</Note>
					)}
				</div>
			</li>,
		);

		if (steps.length > 0) {
			rows.push(
				<Swing
					key={`out-${m.folder}`}
					dir="out"
					color={line}
				/>,
			);
			steps.forEach((c, j) => {
				const state = stepState(m, j);
				rows.push(
					<li
						key={c.id}
						className="flex"
					>
						<Gutter
							spec={{
								lanes: STEP_LANE + 1,
								segments: [{ lane: STEP_LANE, color: line, span: "full" }],
								dot: {
									lane: STEP_LANE,
									color: state === "failed" ? RED : LINE,
									shape:
										state === "failed"
											? "failed"
											: state === "skipped"
												? "skipped"
												: isPending
													? "start"
													: "commit",
								},
							}}
						/>
						<StepBody
							c={c}
							step={j + 1}
							state={state}
							isOpen={open.has(c.id)}
							onToggle={() => toggle(c.id)}
						/>
					</li>,
				);
			});
			rows.push(
				<Swing
					key={`in-${m.folder}`}
					dir="in"
					color={line}
				/>,
			);
		}

		if (i === headIndex) {
			rows.push(
				<li
					key="head"
					className="flex"
				>
					<Gutter
						spec={{
							lanes: 1,
							segments: [
								{ lane: 0, color: LINE, span: "top" },
								...(isLast ? [] : [{ lane: 0, color: PENDING_LINE, span: "bottom" as const }]),
							],
							dot: { lane: 0, color: NODE, shape: "root" },
						}}
					/>
					<div className="h-8 flex items-center gap-2 px-2 text-xs">
						<RefPill>HEAD → {PRISMA_TARGET}</RefPill>
						<span className="text-muted-foreground">
							{pending.length > 0
								? `the database is here · ${pending.length} pending below`
								: "the database is up to date"}
						</span>
					</div>
				</li>,
			);
		}

		if (isLast && isPending) {
			rows.push(
				<li
					key="end"
					className="flex"
				>
					<Gutter
						spec={{
							lanes: 1,
							segments: [{ lane: 0, color: PENDING_LINE, span: "top" }],
							dot: { lane: 0, color: LINE, shape: "start" },
						}}
					/>
					<div className="h-8 flex items-center px-2 text-xs text-muted-foreground">
						end of {PRISMA_DIR}
					</div>
				</li>,
			);
		}
	});

	return (
		<div className="@container/plan flex h-full flex-col overflow-hidden">
			<header className="h-8 shrink-0 border-b border-border w-full flex items-center justify-between bg-background text-xs">
				<div className="flex min-w-0 items-center">
					<span className="px-2.5 h-8 flex items-center gap-1.5 border-r border-border text-muted-foreground">
						<FolderOpen className="size-3.5" />
						<span className="font-mono text-foreground">{PRISMA_DIR}</span>
					</span>
					<span className="px-2.5 h-8 flex items-center gap-1.5 border-r border-border text-muted-foreground">
						provider <span className="text-foreground">{PRISMA_PROVIDER}</span>
					</span>
					<span className="px-2.5 h-8 flex items-center gap-1.5 border-r border-border text-muted-foreground">
						database <span className="text-foreground">{PRISMA_TARGET}</span>
					</span>
					<span className="hidden @3xl/plan:flex px-2.5 text-muted-foreground">
						scanned {scannedAt}
					</span>
				</div>
				<Button
					type="button"
					variant="ghost"
					className={toolbarButton}
					onClick={() =>
						setScannedAt(new Date().toLocaleTimeString("en-US", { hourCycle: "h23" }))
					}
				>
					<RefreshCw className="size-3.5" />
					Rescan
				</Button>
			</header>

			<div className="flex min-h-0 flex-1 flex-col overflow-auto @3xl/plan:flex-row @3xl/plan:overflow-hidden">
				<div className="min-w-0 shrink-0 @3xl/plan:flex-1 @3xl/plan:shrink @3xl/plan:overflow-auto">
					<div className="mx-auto max-w-3xl px-6 py-5">
						<h1 className="text-sm font-medium">Migration history</h1>
						<p className="mt-1 text-xs text-muted-foreground">
							{migrations.length} migrations in <code>{PRISMA_DIR}</code>, checked against{" "}
							<code>_prisma_migrations</code> in {PRISMA_TARGET}
						</p>
						<ol className="mt-6">{rows}</ol>
					</div>
				</div>

				<aside className="shrink-0 border-t border-border p-3 text-xs @3xl/plan:w-72 @3xl/plan:border-t-0 @3xl/plan:border-l @3xl/plan:overflow-auto">
					<h2 className="font-medium">Status</h2>
					<dl className="mt-2 space-y-1">
						{(
							[
								["Applied", migrations.filter((m) => m.status === "applied").length, ""],
								["Pending", pending.length, ""],
								["Failed", failed.length, RISK_STYLE.destructive],
								["Edited after running", edited.length, RISK_STYLE.review],
								["Folder missing", missing.length, ""],
							] as const
						).map(([label, n, style]) => (
							<div
								key={label}
								className="flex justify-between"
							>
								<dt className={n > 0 ? style : "text-muted-foreground"}>{label}</dt>
								<dd className="tabular-nums">{n}</dd>
							</div>
						))}
					</dl>

					{failed.map((m) => (
						<section
							key={m.folder}
							className="mt-5"
						>
							<h3 className={cn("font-medium", RISK_STYLE.destructive)}>
								Fix {parseFolder(m.folder).name}
							</h3>
							<p className="mt-1 text-muted-foreground">
								Undo {ranSteps(m)} by hand, then mark it rolled back so deploy retries it:
							</p>
							<CopyCommand command={PRISMA_COMMANDS.resolveRolledBack(m.folder)} />
							<p className="mt-2 text-muted-foreground">
								Or finish it by hand and mark it applied:
							</p>
							<CopyCommand command={PRISMA_COMMANDS.resolveApplied(m.folder)} />
						</section>
					))}

					<section className="mt-5">
						<h3 className="font-medium">Deploy</h3>
						<p className="mt-1 text-muted-foreground">
							{pending.length} pending · {pendingSteps.length} steps
							{pendingLoss > 0 && (
								<span className={RISK_STYLE.destructive}> · {pendingLoss} data loss</span>
							)}
						</p>
						<CopyCommand command={PRISMA_COMMANDS.deploy} />
						{failed.length > 0 && (
							<p className="mt-2 text-red-600 dark:text-red-400">
								Blocked: Prisma refuses to deploy while a migration has failed (P3009). Fix it
								first.
							</p>
						)}
						<p className="mt-2 text-muted-foreground">
							db-studio only reads your migrations. Prisma applies them.
						</p>
					</section>
				</aside>
			</div>
		</div>
	);
};
