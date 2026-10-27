// PROTOTYPE — throwaway. Graph variant "log": `git log --graph --oneline --reverse`, one dense
// line per statement with short hashes and git's ref colors. Click a line for its SQL.
import { cn } from "@db-studio/ui/utils";
import type { ReactNode } from "react";
import { SqlBlock } from "./compare-header";
import { LANE_COLORS, PHASES, shortHash } from "./fixture";
import { type StepsProps, stateLabel, stateStyle } from "./steps-shared";

export const STEPS_LOG_NAME = "Terminal log";

const TRUNK = "#a1a1aa";

const G = ({ children, color }: { children: ReactNode; color: string }) => (
	<span style={{ color }}>{children}</span>
);

const Hash = ({ seed }: { seed: string }) => (
	<span className="text-amber-600 dark:text-[#d29922]">{shortHash(seed)}</span>
);

const Line = ({
	graph,
	children,
	onClick,
	dim,
}: {
	graph: ReactNode;
	children?: ReactNode;
	onClick?: () => void;
	dim?: boolean;
}) => {
	const body = (
		<>
			<span className="w-10 shrink-0 whitespace-pre">{graph}</span>
			<span className="min-w-0 flex-1 flex items-baseline gap-2">{children}</span>
		</>
	);
	const className = cn(
		"flex w-full items-baseline px-2 text-left leading-6",
		dim && "opacity-50",
		onClick && "hover:bg-muted/40 rounded",
	);
	return onClick ? (
		<button
			type="button"
			className={className}
			onClick={onClick}
		>
			{body}
		</button>
	) : (
		<div className={className}>{body}</div>
	);
};

export const StepsLog = ({
	changes,
	stateOf,
	open,
	onToggle,
	target,
	outcome,
}: StepsProps) => {
	const t = <G color={TRUNK}>|</G>;
	const lines: ReactNode[] = [
		<Line
			key="begin"
			graph={<G color={TRUNK}>*</G>}
		>
			<Hash seed={`begin-${target}`} />
			<span>
				(<span className="font-bold text-emerald-600 dark:text-emerald-400">{target}</span>)
			</span>
			<span className="text-muted-foreground">BEGIN</span>
		</Line>,
	];

	let step = 0;
	for (const phase of [1, 2, 3, 4] as const) {
		const items = changes.filter((c) => c.phase === phase);
		if (!items.length) continue;
		const col = LANE_COLORS[phase - 1];

		lines.push(
			<Line
				key={`phase-${phase}`}
				graph={<G color={TRUNK}>*</G>}
			>
				<Hash seed={`phase-${phase}-${target}`} />
				<span className="font-bold text-amber-600 dark:text-[#d29922]">
					(tag: phase-{phase})
				</span>
				<span className="text-muted-foreground">{PHASES[phase]}</span>
			</Line>,
			<Line
				key={`fork-${phase}`}
				graph={
					<>
						{t}
						<G color={col}>\</G>
					</>
				}
			/>,
		);

		for (const c of items) {
			step += 1;
			const state = stateOf(step);
			const mark = state === "failed" ? "x" : state === "skipped" ? "·" : "*";
			lines.push(
				<Line
					key={c.id}
					dim={state === "skipped"}
					onClick={() => onToggle(c.id)}
					graph={
						<>
							{t} <G color={state === "failed" ? "#ef4444" : col}>{mark}</G>
						</>
					}
				>
					<Hash seed={c.sql} />
					<span className="min-w-0 flex-1 truncate">
						<span className="text-muted-foreground">{c.table}:</span> {c.summary}
					</span>
					<span className={cn("shrink-0", stateStyle(c, state))}>
						{stateLabel(c, state).toLowerCase()}
					</span>
				</Line>,
			);
			if (open.has(c.id)) {
				const height = c.sql.split("\n").length;
				lines.push(
					<div
						key={`${c.id}-sql`}
						className="flex px-2"
					>
						<span className="w-10 shrink-0 whitespace-pre leading-5 py-1">
							{Array.from({ length: height }, (_, i) => (
								<div key={i}>
									{t} <G color={col}>|</G>
								</div>
							))}
						</span>
						<SqlBlock
							sql={c.sql}
							className="min-w-0 flex-1 py-1"
						/>
					</div>,
				);
			}
		}

		lines.push(
			<Line
				key={`merge-${phase}`}
				graph={
					<>
						{t}
						<G color={col}>/</G>
					</>
				}
			/>,
		);
	}

	lines.push(
		<Line
			key="end"
			graph={
				<G color={outcome === "failed" ? "#ef4444" : TRUNK}>
					{outcome === "failed" ? "x" : "*"}
				</G>
			}
		>
			<Hash seed={`end-${target}-${outcome}`} />
			{outcome === "failed" ? (
				<span className="text-red-600 dark:text-red-400">ROLLBACK · {target} unchanged</span>
			) : (
				<>
					<span>
						(
						{outcome === "applied" ? (
							<>
								<span className="font-bold text-cyan-600 dark:text-cyan-400">HEAD -&gt; </span>
								<span className="font-bold text-emerald-600 dark:text-emerald-400">
									{target}
								</span>
							</>
						) : (
							<span className="font-bold text-muted-foreground">pending</span>
						)}
						)
					</span>
					<span className="text-muted-foreground">COMMIT</span>
				</>
			)}
		</Line>,
	);

	return (
		<div className="mt-6 rounded-md border border-border bg-muted/20 py-2 font-mono text-xs">
			<div className="px-3 pb-1 text-muted-foreground">
				$ git log --graph --oneline --reverse {target}
			</div>
			{lines}
		</div>
	);
};
