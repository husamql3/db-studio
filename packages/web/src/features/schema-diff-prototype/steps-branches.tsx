// PROTOTYPE — throwaway. Graph variant "branches": the transaction is the trunk. Each phase
// forks off it, runs its statements on a branch, and merges back. Clicking a phase collapses it
// to its fork commit, like folding a merged branch in a git client.
import { cn } from "@db-studio/ui/utils";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { LANE_COLORS, PHASES, RISK_STYLE, shortHash } from "./fixture";
import { Gutter, LabelRow, RefPill, StepBody, type StepsProps } from "./steps-shared";

export const STEPS_BRANCHES_NAME = "Phase branches";

const TRUNK = "#a1a1aa";

export const StepsBranches = ({
	changes,
	stateOf,
	open,
	onToggle,
	target,
	source,
	outcome,
}: StepsProps) => {
	const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
	const trunk = { lane: 0, color: TRUNK, span: "full" as const };
	const rows: React.ReactNode[] = [];

	rows.push(
		<LabelRow
			key="begin"
			spec={{
				lanes: 2,
				segments: [{ lane: 0, color: TRUNK, span: "bottom" }],
				dot: { lane: 0, color: TRUNK, shape: "root" },
			}}
		>
			<span className="font-mono text-[11px] text-amber-600 dark:text-amber-400">
				{shortHash(`begin-${target}`)}
			</span>
			<RefPill>{target}</RefPill>
			<span className="text-muted-foreground">BEGIN</span>
		</LabelRow>,
	);

	let step = 0;
	for (const phase of [1, 2, 3, 4] as const) {
		const items = changes.filter((c) => c.phase === phase);
		if (!items.length) continue;
		const col = LANE_COLORS[phase - 1];
		const isCollapsed = collapsed.has(phase);
		const loss = items.filter((c) => c.risk === "destructive").length;
		const review = items.filter((c) => c.risk === "review").length;
		const firstStep = step + 1;
		const branchFailed = items.some((_, i) => stateOf(firstStep + i) === "failed");

		rows.push(
			<li
				key={`fork-${phase}`}
				className="flex"
			>
				<Gutter
					spec={{
						lanes: 2,
						segments: [trunk],
						dot: { lane: 0, color: TRUNK, shape: "commit" },
						curves: isCollapsed ? undefined : [{ lane: 1, color: col, dir: "out" }],
					}}
				/>
				<button
					type="button"
					className="h-8 min-w-0 flex-1 flex items-center gap-2 rounded px-2 text-left text-xs hover:bg-muted/40"
					onClick={() =>
						setCollapsed((prev) => {
							const next = new Set(prev);
							if (next.has(phase)) next.delete(phase);
							else next.add(phase);
							return next;
						})
					}
				>
					<ChevronRight
						className={cn(
							"size-3.5 shrink-0 transition-transform",
							!isCollapsed && "rotate-90",
						)}
					/>
					<RefPill color={col}>phase-{phase}</RefPill>
					<span className="truncate font-medium">{PHASES[phase]}</span>
					<span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
						{items.length} {items.length === 1 ? "statement" : "statements"}
					</span>
					{review > 0 && <span className={RISK_STYLE.review}>{review} review</span>}
					{loss > 0 && <span className={RISK_STYLE.destructive}>{loss} data loss</span>}
				</button>
			</li>,
		);

		if (isCollapsed) {
			step += items.length;
			continue;
		}

		for (const c of items) {
			step += 1;
			const state = stateOf(step);
			rows.push(
				<li
					key={c.id}
					className="flex"
				>
					<Gutter
						spec={{
							lanes: 2,
							segments: [trunk, { lane: 1, color: col, span: "full" }],
							dot: {
								lane: 1,
								color: col,
								shape:
									state === "failed" ? "failed" : state === "skipped" ? "skipped" : "commit",
							},
						}}
					/>
					<StepBody
						c={c}
						step={step}
						state={state}
						isOpen={open.has(c.id)}
						onToggle={() => onToggle(c.id)}
					/>
				</li>,
			);
		}

		rows.push(
			<LabelRow
				key={`merge-${phase}`}
				spec={{
					lanes: 2,
					segments: [trunk],
					dot: { lane: 0, color: TRUNK, shape: "merge" },
					curves: [{ lane: 1, color: col, dir: "in" }],
				}}
			>
				<span className="text-muted-foreground">
					{branchFailed ? (
						<span className={RISK_STYLE.destructive}>phase-{phase} failed</span>
					) : (
						<>Merge phase-{phase}</>
					)}
				</span>
			</LabelRow>,
		);
	}

	const failed = outcome === "failed";
	rows.push(
		<LabelRow
			key="end"
			spec={{
				lanes: 2,
				segments: [{ lane: 0, color: TRUNK, span: "top" }],
				dot: {
					lane: 0,
					color: failed ? "#ef4444" : TRUNK,
					shape: failed ? "failed" : "merge",
				},
			}}
		>
			{failed ? (
				<span className={RISK_STYLE.destructive}>ROLLBACK · {target} unchanged</span>
			) : (
				<>
					<RefPill>{outcome === "applied" ? `HEAD → ${target}` : "pending"}</RefPill>
					<span className="text-muted-foreground">
						COMMIT · {target} {outcome === "applied" ? "matched" : "will match"} {source}
					</span>
				</>
			)}
		</LabelRow>,
	);

	return <ol className="mt-6">{rows}</ol>;
};
