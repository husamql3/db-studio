// PROTOTYPE — throwaway. Variant C (the pick): an ordered migration plan, phase by phase.
// Drafts are editable and need every data-loss step confirmed before Run; applied and failed
// runs from the sidebar history open read-only with their outcome.
import { Button } from "@db-studio/ui/button";
import { Checkbox } from "@db-studio/ui/checkbox";
import { cn } from "@db-studio/ui/utils";
import { Link } from "@tanstack/react-router";
import { CircleHelp, CircleX, GitCompareArrows, Play, Save } from "lucide-react";
import { useState } from "react";
import { CompareHeader } from "./compare-header";
import {
	type ProtoMigration,
	RENAME_CANDIDATE,
	RISK_STYLE,
	STATUS_STYLE,
	toScript,
} from "./fixture";
import { STEPS_BRANCHES_NAME, StepsBranches } from "./steps-branches";
import { STEPS_LANES_NAME, StepsLanes } from "./steps-lanes";
import { STEPS_LIST_NAME, StepsList } from "./steps-list";
import { STEPS_LOG_NAME, StepsLog } from "./steps-log";
import { RISK_LABEL, type StepState } from "./steps-shared";
import { STEPS_TIMELINE_NAME, StepsTimeline } from "./steps-timeline";
import type { VariantProps } from "./variant-props";

/** Graph variants for the step list, cycled by the prototype switcher via `?graph=`. */
export const STEP_VARIANTS = [
	{ key: "timeline", name: STEPS_TIMELINE_NAME, Component: StepsTimeline },
	{ key: "list", name: STEPS_LIST_NAME, Component: StepsList },
	{ key: "lanes", name: STEPS_LANES_NAME, Component: StepsLanes },
	{ key: "branches", name: STEPS_BRANCHES_NAME, Component: StepsBranches },
	{ key: "log", name: STEPS_LOG_NAME, Component: StepsLog },
];

export const VARIANT_C_NAME = "Migration plan";

const flip = (set: Set<string>, id: string) => {
	const next = new Set(set);
	if (next.has(id)) next.delete(id);
	else next.add(id);
	return next;
};

const subtitle = (m: ProtoMigration, count: number) => {
	switch (m.status) {
		case "new":
			return `Not saved · ${count} statements, run in one transaction`;
		case "draft":
			return `Draft · saved ${m.date} · ${count} statements`;
		case "applied":
			return `Applied to ${m.to} · ${m.date} · ${count} statements in ${m.durationMs} ms`;
		case "failed":
			return `Failed on ${m.to} · ${m.date} · rolled back after ${m.durationMs} ms`;
	}
};

export const VariantC = ({
	migration: m,
	graph,
	from,
	to,
	onFrom,
	onTo,
}: VariantProps & { migration: ProtoMigration; graph: string }) => {
	const editable = m.status === "new" || m.status === "draft";
	const [rename, setRename] = useState<boolean | null>(m.askRename ? null : true);
	const [open, setOpen] = useState<Set<string>>(
		new Set(m.failure ? [m.changes(true)[m.failure.step - 1]?.id ?? ""] : []),
	);
	const [acked, setAcked] = useState<Set<string>>(new Set());

	const changes = m.changes(rename === true);
	const script = toScript(changes);
	const destructive = changes.filter((c) => c.risk === "destructive");
	const counts = (["safe", "review", "destructive"] as const).map(
		(r) => [r, changes.filter((c) => c.risk === r).length] as const,
	);
	const ready = rename !== null && destructive.every((c) => acked.has(c.id));

	const stepState = (step: number): StepState => {
		if (m.status === "applied") return "done";
		if (!m.failure) return "pending";
		if (step < m.failure.step) return "done";
		return step === m.failure.step ? "failed" : "skipped";
	};

	return (
		<div className="@container/plan flex h-full flex-col overflow-hidden">
			<CompareHeader
				from={editable ? from : m.from}
				to={editable ? to : m.to}
				onFrom={onFrom}
				onTo={onTo}
				script={script}
				readOnly={!editable}
			/>

			<div className="flex min-h-0 flex-1 flex-col overflow-auto @3xl/plan:flex-row @3xl/plan:overflow-hidden">
				<div className="min-w-0 shrink-0 @3xl/plan:flex-1 @3xl/plan:shrink @3xl/plan:overflow-auto">
					<div className="mx-auto max-w-3xl px-6 py-5">
						<h1 className="text-sm font-medium">{m.name}</h1>
						<p className={cn("mt-1 text-xs", STATUS_STYLE[m.status])}>
							{subtitle(m, changes.length)}
						</p>

						{m.failure && (
							<section className="mt-5 rounded-md border border-red-500/40 bg-red-500/5 p-3 text-xs">
								<div className="flex items-center gap-1.5 font-medium text-red-600 dark:text-red-400">
									<CircleX className="size-3.5" />
									Step {m.failure.step} failed
								</div>
								<p className="mt-1 font-mono">{m.failure.error}</p>
								<p className="mt-2 text-muted-foreground">
									Postgres rolled back the whole transaction, so <code>{m.to}</code> is
									unchanged.
								</p>
							</section>
						)}

						{editable && m.askRename && (
							<section className="mt-5 rounded-md border border-border">
								<div className="flex items-center gap-2 px-3 h-8 border-b border-border text-xs font-medium">
									<CircleHelp className="size-3.5 text-amber-600 dark:text-amber-400" />1
									question before the plan is final
								</div>
								<div className="p-3 text-xs">
									<p>
										<code>
											{RENAME_CANDIDATE.table}.{RENAME_CANDIDATE.from}
										</code>{" "}
										exists only in the target and <code>{RENAME_CANDIDATE.to}</code> only in
										the source. Is it the same column?
									</p>
									<div className="mt-2 flex flex-wrap gap-2">
										{(
											[
												[true, "Yes, rename (keeps data)"],
												[false, "No, drop and add (loses data)"],
											] as const
										).map(([value, label]) => (
											<Button
												key={String(value)}
												type="button"
												size="sm"
												variant={rename === value ? "default" : "outline"}
												className="h-auto min-h-7 whitespace-normal text-xs"
												onClick={() => setRename(value)}
											>
												{label}
											</Button>
										))}
									</div>
								</div>
							</section>
						)}

						{(() => {
							const Steps = (STEP_VARIANTS.find((v) => v.key === graph) ?? STEP_VARIANTS[0])
								.Component;
							return (
								<Steps
									changes={changes}
									stateOf={stepState}
									open={open}
									onToggle={(id) => setOpen(flip(open, id))}
									target={editable ? to : m.to}
									source={editable ? from : m.from}
									outcome={
										m.status === "applied"
											? "applied"
											: m.status === "failed"
												? "failed"
												: "pending"
									}
								/>
							);
						})()}
					</div>
				</div>

				<aside className="shrink-0 border-t border-border p-3 text-xs @3xl/plan:w-72 @3xl/plan:border-t-0 @3xl/plan:border-l @3xl/plan:overflow-auto">
					<h2 className="font-medium">{editable ? "Review" : "Run"}</h2>
					<dl className="mt-2 space-y-1">
						{counts.map(([risk, n]) => (
							<div
								key={risk}
								className="flex justify-between"
							>
								<dt className={RISK_STYLE[risk]}>{RISK_LABEL[risk]}</dt>
								<dd className="tabular-nums">{n}</dd>
							</div>
						))}
						{!editable && (
							<>
								<div className="flex justify-between pt-2">
									<dt className="text-muted-foreground">Target</dt>
									<dd>{m.to}</dd>
								</div>
								<div className="flex justify-between">
									<dt className="text-muted-foreground">Ran</dt>
									<dd>{m.date}</dd>
								</div>
								<div className="flex justify-between">
									<dt className="text-muted-foreground">Duration</dt>
									<dd className="tabular-nums">{m.durationMs} ms</dd>
								</div>
							</>
						)}
					</dl>

					{editable ? (
						<>
							<h3 className="mt-5 font-medium">Confirm data loss</h3>
							{destructive.length === 0 && (
								<p className="mt-2 text-muted-foreground">
									Nothing in this plan deletes data.
								</p>
							)}
							<ul className="mt-2 space-y-2">
								{destructive.map((c) => (
									<li key={c.id}>
										<label
											htmlFor={`ack-${c.id}`}
											className="flex items-start gap-2"
										>
											<Checkbox
												id={`ack-${c.id}`}
												className="mt-0.5"
												checked={acked.has(c.id)}
												onCheckedChange={() => setAcked(flip(acked, c.id))}
											/>
											<span>
												{c.summary} <span className="text-muted-foreground">on {c.table}</span>
												{c.before && (
													<span className="block text-muted-foreground">{c.before}</span>
												)}
											</span>
										</label>
									</li>
								))}
							</ul>

							<Button
								type="button"
								className="mt-5 w-full h-8 text-xs gap-1.5"
								disabled={!ready}
								onClick={() => alert("PROTOTYPE: nothing runs")}
							>
								<Play className="size-3.5" />
								Run on {to}
							</Button>
							{m.status === "new" && (
								<Button
									type="button"
									variant="outline"
									className="mt-2 w-full h-8 text-xs gap-1.5"
									onClick={() => alert("PROTOTYPE: nothing is saved")}
								>
									<Save className="size-3.5" />
									Save as draft
								</Button>
							)}
							<p className="mt-2 text-muted-foreground">
								{rename === null
									? "Answer the rename question first."
									: ready
										? "Runs in one transaction. Postgres rolls back on any error."
										: "Confirm each data-loss step to continue."}
							</p>
						</>
					) : (
						<>
							<Button
								asChild
								variant="outline"
								className="mt-5 w-full h-8 text-xs gap-1.5"
							>
								<Link
									to="/migrations"
									search={(prev) => ({ ...prev, migration: "new" })}
								>
									<GitCompareArrows className="size-3.5" />
									{m.failure ? "Compare again to fix" : "Compare again"}
								</Link>
							</Button>
							<p className="mt-2 text-muted-foreground">
								{m.failure
									? "Fix the cause in the target, then build a fresh plan from the current schemas."
									: `Checks whether ${m.to} has drifted since this run.`}
							</p>
						</>
					)}
				</aside>
			</div>
		</div>
	);
};
