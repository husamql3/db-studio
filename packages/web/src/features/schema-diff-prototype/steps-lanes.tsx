// PROTOTYPE — throwaway. Graph variant "lanes": every table is a branch. A created table starts
// a lane, a dropped table ends one, a foreign key draws a link from the referenced table's lane,
// and COMMIT merges every lane back together.
import { LANE_COLORS, PHASES, RISK_STYLE } from "./fixture";
import {
	Gutter,
	type GutterSpec,
	LabelRow,
	RefPill,
	StepBody,
	type StepsProps,
} from "./steps-shared";

export const STEPS_LANES_NAME = "Table lanes";

export const StepsLanes = ({
	changes,
	stateOf,
	open,
	onToggle,
	target,
	source,
	outcome,
}: StepsProps) => {
	const created = new Set(
		changes.filter((c) => c.kind === "create-table").map((c) => c.table),
	);
	const tables = [...new Set(changes.map((c) => c.table))].sort(
		(a, b) => Number(created.has(a)) - Number(created.has(b)),
	);
	const lane = new Map(tables.map((t, i) => [t, i]));
	const color = (t: string) => LANE_COLORS[(lane.get(t) ?? 0) % LANE_COLORS.length];
	const lanes = tables.length;

	const active = new Set(tables.filter((t) => !created.has(t)));
	const through = (except?: string) =>
		[...active]
			.filter((t) => t !== except)
			.map((t) => ({ lane: lane.get(t) ?? 0, color: color(t), span: "full" as const }));

	const rows: React.ReactNode[] = [];

	rows.push(
		<LabelRow
			key="begin"
			spec={{
				lanes,
				segments: [...active].map((t) => ({
					lane: lane.get(t) ?? 0,
					color: color(t),
					span: "bottom",
				})),
			}}
		>
			<RefPill>{target}</RefPill>
			<span className="text-muted-foreground">BEGIN</span>
			<span className="ml-auto flex flex-wrap justify-end gap-x-3">
				{tables.map((t) => (
					<span
						key={t}
						className="flex items-center gap-1"
						style={{ color: color(t) }}
					>
						<span
							className="size-1.5 rounded-full"
							style={{ background: color(t) }}
						/>
						{t}
					</span>
				))}
			</span>
		</LabelRow>,
	);

	let step = 0;
	for (const phase of [1, 2, 3, 4] as const) {
		const items = changes.filter((c) => c.phase === phase);
		if (!items.length) continue;

		rows.push(
			<LabelRow
				key={`phase-${phase}`}
				spec={{ lanes, segments: through() }}
			>
				<RefPill>tag: phase-{phase}</RefPill>
				<span className="text-muted-foreground uppercase tracking-wide">{PHASES[phase]}</span>
			</LabelRow>,
		);

		for (const c of items) {
			step += 1;
			const state = stateOf(step);
			const l = lane.get(c.table) ?? 0;
			const col = color(c.table);
			// A failed or skipped CREATE/DROP never happened, so the lane neither starts nor ends.
			const ran = state !== "failed" && state !== "skipped";
			const isCreate = ran && c.kind === "create-table";
			const isDrop = ran && c.kind === "drop-table";
			const spec: GutterSpec = {
				lanes,
				segments: [
					...through(c.table),
					{ lane: l, color: col, span: isCreate ? "bottom" : isDrop ? "top" : "full" },
				],
				dot: {
					lane: l,
					color: col,
					shape:
						state === "failed"
							? "failed"
							: state === "skipped"
								? "skipped"
								: isCreate
									? "start"
									: isDrop
										? "end"
										: "commit",
				},
				curves:
					c.references && active.has(c.references)
						? [{ lane: lane.get(c.references) ?? 0, color: color(c.references), dir: "in" }]
						: undefined,
			};
			if (isCreate) active.add(c.table);
			if (isDrop) active.delete(c.table);

			rows.push(
				<li
					key={c.id}
					className="flex"
				>
					<Gutter spec={spec} />
					<StepBody
						c={c}
						step={step}
						state={state}
						isOpen={open.has(c.id)}
						onToggle={() => onToggle(c.id)}
						tableColor={col}
					/>
				</li>,
			);
		}
	}

	const remaining = [...active].map((t) => lane.get(t) ?? 0).sort((a, b) => a - b);
	const into = remaining[0] ?? 0;
	const failed = outcome === "failed";
	rows.push(
		<LabelRow
			key="end"
			spec={{
				lanes,
				segments: failed
					? remaining.map((l) => ({ lane: l, color: LANE_COLORS[l], span: "top" as const }))
					: [{ lane: into, color: LANE_COLORS[into], span: "top" }],
				dot: { lane: into, color: LANE_COLORS[into], shape: failed ? "failed" : "merge" },
				curves: failed
					? undefined
					: remaining
							.slice(1)
							.map((l) => ({ lane: l, color: LANE_COLORS[l], dir: "in" as const })),
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
