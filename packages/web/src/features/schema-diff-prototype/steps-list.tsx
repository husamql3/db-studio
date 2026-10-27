// PROTOTYPE — throwaway. Graph variant "list": the phase list as it was before the graph work.
import { cn } from "@db-studio/ui/utils";
import { PHASES } from "./fixture";
import { StepBody, type StepState, type StepsProps } from "./steps-shared";

export const STEPS_LIST_NAME = "Phase list (before)";

const DOT: Record<StepState, string> = {
	pending: "border-border bg-background",
	done: "border-emerald-500 bg-emerald-500",
	failed: "border-red-500 bg-red-500",
	skipped: "border-border bg-muted",
};

export const StepsList = ({ changes, stateOf, open, onToggle }: StepsProps) => {
	let step = 0;
	return ([1, 2, 3, 4] as const).map((phase) => {
		const items = changes.filter((c) => c.phase === phase);
		if (!items.length) return null;
		return (
			<section
				key={phase}
				className="mt-6"
			>
				<h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
					Phase {phase} · {PHASES[phase]}
				</h2>
				<ol className="mt-2 border-l border-border">
					{items.map((c) => {
						step += 1;
						const state = stateOf(step);
						return (
							<li
								key={c.id}
								className="relative pl-3"
							>
								<span
									className={cn(
										"absolute -left-[5px] top-3 size-2.5 rounded-full border",
										DOT[state],
									)}
								/>
								<StepBody
									c={c}
									step={step}
									state={state}
									isOpen={open.has(c.id)}
									onToggle={() => onToggle(c.id)}
								/>
							</li>
						);
					})}
				</ol>
			</section>
		);
	});
};
