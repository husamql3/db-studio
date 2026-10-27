// PROTOTYPE — throwaway. Pieces shared by the step-list variants: the step row body and the
// per-row graph gutter. Each row draws its own slice of the graph, so lanes keep running
// through a row when its SQL is expanded.
import { cn } from "@db-studio/ui/utils";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { SqlBlock } from "./compare-header";
import { type ProtoChange, RISK_STYLE, type Risk } from "./fixture";

export type StepState = "pending" | "done" | "failed" | "skipped";

export const RISK_LABEL: Record<Risk, string> = {
	safe: "Safe",
	review: "Review",
	destructive: "Data loss",
};

export type StepsProps = {
	changes: ProtoChange[];
	stateOf: (step: number) => StepState;
	open: Set<string>;
	onToggle: (id: string) => void;
	target: string;
	source: string;
	/** "applied" / "failed" end the graph with COMMIT / ROLLBACK; drafts end with a pending commit. */
	outcome: "pending" | "applied" | "failed";
};

export const stateLabel = (c: ProtoChange, state: StepState) =>
	state === "skipped" ? "Not run" : state === "failed" ? "Failed" : RISK_LABEL[c.risk];

export const stateStyle = (c: ProtoChange, state: StepState) =>
	state === "skipped"
		? "text-muted-foreground"
		: state === "failed"
			? RISK_STYLE.destructive
			: RISK_STYLE[c.risk];

/** One step: a fixed 32px header line (the graph dot sits at its middle) plus optional SQL. */
export const StepBody = ({
	c,
	step,
	state,
	isOpen,
	onToggle,
	tableColor,
}: {
	c: ProtoChange;
	step: number;
	state: StepState;
	isOpen: boolean;
	onToggle: () => void;
	tableColor?: string;
}) => (
	<div className={cn("@container min-w-0 flex-1", state === "skipped" && "opacity-50")}>
		<button
			type="button"
			className="h-8 w-full flex items-center gap-3 text-left text-xs hover:bg-muted/40 rounded px-2"
			onClick={onToggle}
		>
			<span className="w-5 shrink-0 text-muted-foreground tabular-nums">{step}</span>
			<span
				className="shrink-0 font-medium"
				style={tableColor ? { color: tableColor } : undefined}
			>
				{c.table}
			</span>
			<span className="min-w-0 flex-1 truncate">{c.summary}</span>
			{(c.before || c.after) && (
				<span className="hidden @xl:inline font-mono text-[11px] text-muted-foreground truncate max-w-56">
					{c.before}
					{c.before && c.after && " → "}
					{c.after}
				</span>
			)}
			<span className={cn("w-20 shrink-0 whitespace-nowrap text-right", stateStyle(c, state))}>
				{stateLabel(c, state)}
			</span>
			<ChevronRight
				className={cn("size-3.5 shrink-0 transition-transform", isOpen && "rotate-90")}
			/>
		</button>
		{isOpen && (
			<div className="mt-1.5 mb-2 ml-2 rounded border border-border bg-muted/20">
				<SqlBlock
					sql={c.sql}
					className="py-2"
				/>
			</div>
		)}
	</div>
);

// --- Graph gutter ---

const LANE_W = 16;
const ROW_H = 32;
const DOT_Y = 16;
export const laneX = (lane: number) => lane * LANE_W + LANE_W / 2 + 4;

export type Segment = { lane: number; color: string; span: "full" | "top" | "bottom" };

export type GutterSpec = {
	lanes: number;
	segments: Segment[];
	dot?: {
		lane: number;
		color: string;
		shape: "commit" | "start" | "end" | "merge" | "root" | "failed" | "skipped";
	};
	/** "in": a line from the top of `lane` into the dot (merge). "out": from the dot down to `lane` (fork). */
	curves?: { lane: number; color: string; dir: "in" | "out" }[];
};

const Dot = ({ dot }: { dot: NonNullable<GutterSpec["dot"]> }) => {
	const cx = laneX(dot.lane);
	const bg = "var(--background)";
	switch (dot.shape) {
		case "commit":
			return (
				<circle
					cx={cx}
					cy={DOT_Y}
					r={4.5}
					fill={dot.color}
					stroke={bg}
					strokeWidth={2}
				/>
			);
		case "start":
		case "skipped":
			return (
				<circle
					cx={cx}
					cy={DOT_Y}
					r={4.5}
					fill={bg}
					stroke={dot.shape === "skipped" ? "#71717a" : dot.color}
					strokeWidth={2}
					strokeDasharray={dot.shape === "skipped" ? "2 2" : undefined}
				/>
			);
		case "merge":
			return (
				<>
					<circle
						cx={cx}
						cy={DOT_Y}
						r={6}
						fill={bg}
						stroke={dot.color}
						strokeWidth={2}
					/>
					<circle
						cx={cx}
						cy={DOT_Y}
						r={2.5}
						fill={dot.color}
					/>
				</>
			);
		case "root":
			return (
				<rect
					x={cx - 5}
					y={DOT_Y - 5}
					width={10}
					height={10}
					rx={2}
					fill={dot.color}
					stroke={bg}
					strokeWidth={2}
				/>
			);
		case "end":
		case "failed":
			// Solid disc so the mark reads the same on any row background (hover, selected).
			return (
				<>
					<circle
						cx={cx}
						cy={DOT_Y}
						r={6}
						fill={dot.shape === "failed" ? "#ef4444" : dot.color}
					/>
					<g
						stroke="white"
						strokeWidth={1.75}
						strokeLinecap="round"
					>
						<line
							x1={cx - 2.5}
							y1={DOT_Y - 2.5}
							x2={cx + 2.5}
							y2={DOT_Y + 2.5}
						/>
						<line
							x1={cx + 2.5}
							y1={DOT_Y - 2.5}
							x2={cx - 2.5}
							y2={DOT_Y + 2.5}
						/>
					</g>
				</>
			);
	}
};

export const Gutter = ({ spec }: { spec: GutterSpec }) => {
	const width = laneX(spec.lanes - 1) + 8;
	return (
		<div
			className="relative shrink-0 self-stretch"
			style={{ width }}
		>
			{spec.segments.map((s) => (
				<span
					key={`${s.lane}-${s.span}`}
					className="absolute w-0.5 -translate-x-1/2"
					style={{
						left: laneX(s.lane),
						top: s.span === "bottom" ? DOT_Y : 0,
						...(s.span === "top" ? { height: DOT_Y } : { bottom: 0 }),
						background: s.color,
					}}
				/>
			))}
			<svg
				className="absolute left-0 top-0 overflow-visible"
				width={width}
				height={ROW_H}
				aria-hidden
			>
				{spec.dot &&
					spec.curves?.map((c) => {
						const dx = laneX(spec.dot?.lane ?? 0);
						const lx = laneX(c.lane);
						const d =
							c.dir === "in"
								? `M ${lx} 0 C ${lx} 10, ${dx} 8, ${dx} ${DOT_Y}`
								: `M ${dx} ${DOT_Y} C ${dx} 24, ${lx} 22, ${lx} ${ROW_H}`;
						return (
							<path
								key={`${c.dir}-${c.lane}`}
								d={d}
								fill="none"
								stroke={c.color}
								strokeWidth={2}
							/>
						);
					})}
				{spec.dot && <Dot dot={spec.dot} />}
			</svg>
		</div>
	);
};

/** A non-step graph row (BEGIN, phase tag, COMMIT): same 32px height as a step header. */
export const LabelRow = ({ spec, children }: { spec: GutterSpec; children: ReactNode }) => (
	<li className="flex">
		<Gutter spec={spec} />
		<div className="h-8 min-w-0 flex-1 flex items-center gap-2 px-2 text-xs">{children}</div>
	</li>
);

export const RefPill = ({ children, color }: { children: ReactNode; color?: string }) => (
	<span
		className="rounded-sm border px-1.5 py-px font-mono text-[11px] leading-4"
		style={color ? { borderColor: color, color } : undefined}
	>
		{children}
	</span>
);
