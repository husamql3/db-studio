// PROTOTYPE — throwaway. Variant A: change tree on the left, generated SQL on the right.
// Primary affordance: include/exclude each change and watch the script update.
import { Checkbox } from "@db-studio/ui/checkbox";
import { cn } from "@db-studio/ui/utils";
import { GitMerge, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { CompareHeader, SqlBlock } from "./compare-header";
import {
	buildChanges,
	RENAME_CANDIDATE,
	RISK_STYLE,
	toScript,
	UNCHANGED_TABLES,
} from "./fixture";
import type { VariantProps } from "./variant-props";

export const VARIANT_A_NAME = "Change list + SQL";

export const VariantA = ({ from, to, onFrom, onTo }: VariantProps) => {
	const [acceptRename, setAcceptRename] = useState(false);
	const [excluded, setExcluded] = useState<Set<string>>(new Set());
	const [selected, setSelected] = useState<string | null>(null);

	const changes = buildChanges(acceptRename);
	const included = changes.filter((c) => !excluded.has(c.id));
	const script = toScript(included);
	const tables = [...new Set(changes.map((c) => c.table))].sort();
	const destructive = included.filter((c) => c.risk === "destructive").length;

	const toggle = (id: string) =>
		setExcluded((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<CompareHeader
				from={from}
				to={to}
				onFrom={onFrom}
				onTo={onTo}
				script={script}
			/>

			<div className="flex min-h-0 flex-1">
				<aside className="w-[360px] shrink-0 border-r border-border overflow-auto">
					{!acceptRename && (
						<div className="m-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs">
							<div className="flex items-center gap-1.5 font-medium">
								<GitMerge className="size-3.5" />
								Possible rename
							</div>
							<p className="mt-1 text-muted-foreground">
								<code>
									{RENAME_CANDIDATE.table}.{RENAME_CANDIDATE.from}
								</code>{" "}
								was dropped and <code>{RENAME_CANDIDATE.to}</code> was added. Rename it to keep
								its data?
							</p>
							<button
								type="button"
								className="mt-2 text-xs font-medium underline underline-offset-2"
								onClick={() => setAcceptRename(true)}
							>
								Treat as rename
							</button>
						</div>
					)}

					{tables.map((table) => (
						<section key={table}>
							<div className="sticky top-0 bg-muted/60 backdrop-blur px-3 h-7 flex items-center text-xs font-medium border-y border-border">
								{table}
							</div>
							{changes
								.filter((c) => c.table === table)
								.map((c) => (
									<div
										key={c.id}
										className={cn(
											"flex items-start gap-2 px-3 py-1.5 text-xs hover:bg-muted/40 cursor-pointer",
											selected === c.id && "bg-muted",
											excluded.has(c.id) && "opacity-50",
										)}
										onClick={() => setSelected(c.id)}
										onKeyDown={() => {}}
									>
										<Checkbox
											className="mt-0.5"
											checked={!excluded.has(c.id)}
											onCheckedChange={() => toggle(c.id)}
											onClick={(e) => e.stopPropagation()}
										/>
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-1.5">
												<span
													className={cn(
														"size-1.5 rounded-full bg-current",
														RISK_STYLE[c.risk],
													)}
												/>
												<span className="truncate">{c.summary}</span>
											</div>
											{(c.before || c.after) && (
												<div className="mt-0.5 font-mono text-[11px] text-muted-foreground truncate">
													{c.before && <span className="line-through">{c.before}</span>}
													{c.before && c.after && " → "}
													{c.after}
												</div>
											)}
										</div>
									</div>
								))}
						</section>
					))}

					<div className="px-3 py-2 text-xs text-muted-foreground border-t border-border">
						{UNCHANGED_TABLES.length} table unchanged: {UNCHANGED_TABLES.join(", ")}
					</div>
				</aside>

				<section className="min-w-0 flex-1 overflow-auto bg-muted/20">
					<SqlBlock
						sql={script}
						className="py-3"
					/>
				</section>
			</div>

			<footer className="h-9 shrink-0 border-t border-border flex items-center justify-between bg-background px-2 text-xs text-muted-foreground">
				<p>
					<span className="text-foreground font-medium">{included.length}</span> of{" "}
					{changes.length} changes in the script
				</p>
				{destructive > 0 && (
					<p className={cn("flex items-center gap-1.5", RISK_STYLE.destructive)}>
						<TriangleAlert className="size-3.5" />
						{destructive} destructive {destructive === 1 ? "change" : "changes"}
					</p>
				)}
			</footer>
		</div>
	);
};
