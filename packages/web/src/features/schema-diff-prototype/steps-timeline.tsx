// PROTOTYPE — throwaway. Graph variant "timeline": one line that runs down the phases, swings
// out to the right for a phase's steps, and swings back before the next phase:
//
//   ● phase 1
//    \
//      ● step
//      ● step
//    /
//   ● phase 2
//
// Each row's text starts right after its own dot, so the steps sit indented like the line.
// Only steps expand (to their SQL); phases are plain headings.
import type { ReactNode } from "react";
import { PHASES, RISK_STYLE } from "./fixture";
import { Gutter, LabelRow, laneX, RefPill, StepBody, type StepsProps } from "./steps-shared";

export const STEPS_TIMELINE_NAME = "Timeline";

// Theme tokens, so the graph follows light/dark like the rest of the app. Red is kept for failures.
const LINE = "var(--muted-foreground)";
const PHASE_DOT = "var(--foreground)";
export const STEP_LANE = 1;
const SWING_H = 12;

/** The diagonal between the trunk and the step lane: `\` going out, `/` coming back. */
export const Swing = ({ dir, color }: { dir: "out" | "in"; color: string }) => {
	const [top, bottom] = dir === "out" ? [0, STEP_LANE] : [STEP_LANE, 0];
	return (
		<li aria-hidden>
			<svg
				width={laneX(STEP_LANE) + 8}
				height={SWING_H}
				className="block overflow-visible"
			>
				<line
					x1={laneX(top)}
					y1={0}
					x2={laneX(bottom)}
					y2={SWING_H}
					stroke={color}
					strokeWidth={2}
					strokeLinecap="round"
				/>
			</svg>
		</li>
	);
};

export const StepsTimeline = ({
	changes,
	stateOf,
	open,
	onToggle,
	target,
	source,
	outcome,
}: StepsProps) => {
	const phases = ([1, 2, 3, 4] as const).filter((p) => changes.some((c) => c.phase === p));
	const rows: ReactNode[] = [];

	let step = 0;
	let isFirst = true;
	for (const phase of phases) {
		const items = changes.filter((c) => c.phase === phase);
		const loss = items.filter((c) => c.risk === "destructive").length;
		const review = items.filter((c) => c.risk === "review").length;
		const failedHere = items.some((_, j) => stateOf(step + 1 + j) === "failed");

		rows.push(
			<LabelRow
				key={`phase-${phase}`}
				spec={{
					lanes: 1,
					segments: [
						...(isFirst ? [] : [{ lane: 0, color: LINE, span: "top" as const }]),
						{ lane: 0, color: LINE, span: "bottom" },
					],
					dot: { lane: 0, color: failedHere ? "#ef4444" : PHASE_DOT, shape: "merge" },
				}}
			>
				<RefPill>phase {phase}</RefPill>
				<span className="truncate font-medium">{PHASES[phase]}</span>
				<span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
					{items.length} {items.length === 1 ? "step" : "steps"}
				</span>
				{review > 0 && <span className={RISK_STYLE.review}>{review} review</span>}
				{loss > 0 && <span className={RISK_STYLE.destructive}>{loss} data loss</span>}
			</LabelRow>,
			<Swing
				key={`out-${phase}`}
				dir="out"
				color={LINE}
			/>,
		);

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
							lanes: STEP_LANE + 1,
							segments: [{ lane: STEP_LANE, color: LINE, span: "full" }],
							dot: {
								lane: STEP_LANE,
								color: LINE,
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
			<Swing
				key={`in-${phase}`}
				dir="in"
				color={LINE}
			/>,
		);
		isFirst = false;
	}

	const failed = outcome === "failed";
	rows.push(
		<LabelRow
			key="end"
			spec={{
				lanes: 1,
				segments: isFirst ? [] : [{ lane: 0, color: LINE, span: "top" }],
				dot: { lane: 0, color: failed ? "#ef4444" : LINE, shape: failed ? "failed" : "root" },
			}}
		>
			{failed ? (
				<span className={RISK_STYLE.destructive}>ROLLBACK · {target} unchanged</span>
			) : (
				<span className="text-muted-foreground">
					COMMIT · {target} {outcome === "applied" ? "matched" : "will match"} {source}
				</span>
			)}
		</LabelRow>,
	);

	return <ol className="mt-6">{rows}</ol>;
};
