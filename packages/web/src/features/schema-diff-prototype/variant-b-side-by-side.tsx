// PROTOTYPE — throwaway. Variant B: the two schemas side by side, aligned row by row like a
// split code diff. Primary affordance: read the schemas; SQL is a secondary drawer.
import { Switch } from "@db-studio/ui/switch";
import { cn } from "@db-studio/ui/utils";
import { ChevronDown, ChevronUp, Link2 } from "lucide-react";
import { useState } from "react";
import { CompareHeader, SqlBlock } from "./compare-header";
import {
	buildChanges,
	FROM_SNAPSHOT,
	type ProtoColumn,
	RENAME_CANDIDATE,
	TO_SNAPSHOT,
	toScript,
} from "./fixture";
import type { VariantProps } from "./variant-props";

export const VARIANT_B_NAME = "Side-by-side schemas";

type Status = "same" | "added" | "dropped" | "changed";

const ROW_STYLE: Record<Status, string> = {
	same: "",
	added: "bg-emerald-500/10",
	dropped: "bg-red-500/10",
	changed: "bg-amber-500/10",
};

const MARK: Record<Status, string> = { same: " ", added: "+", dropped: "−", changed: "~" };

const describe = (c: ProtoColumn) =>
	[c.type, !c.nullable && "NOT NULL", c.default && `= ${c.default}`, c.pk && "PK"]
		.filter(Boolean)
		.join(" ");

type Row = {
	key: string;
	left?: string;
	right?: string;
	status: Status;
	rename?: boolean;
};

const buildRows = (table: string, acceptRename: boolean): Row[] => {
	const src = FROM_SNAPSHOT.find((t) => t.name === table);
	const dst = TO_SNAPSHOT.find((t) => t.name === table);
	const rows: Row[] = [];
	const names = [
		...new Set([...(src?.columns ?? []), ...(dst?.columns ?? [])].map((c) => c.name)),
	];

	for (const name of names) {
		const isRenameTo =
			acceptRename && table === RENAME_CANDIDATE.table && name === RENAME_CANDIDATE.to;
		const isRenameFrom =
			acceptRename && table === RENAME_CANDIDATE.table && name === RENAME_CANDIDATE.from;
		if (isRenameFrom) continue;
		const a = src?.columns.find((c) => c.name === name);
		const b = dst?.columns.find((c) => c.name === (isRenameTo ? RENAME_CANDIDATE.from : name));
		const left = a && `${a.name}  ${describe(a)}`;
		const right = b && `${b.name}  ${describe(b)}`;
		const status: Status =
			a && b
				? describe(a) === describe(b) && !isRenameTo
					? "same"
					: "changed"
				: a
					? "added"
					: "dropped";
		rows.push({ key: name, left, right, status, rename: isRenameTo });
	}

	const extras = (pick: (t: typeof src) => string[], label: string) => {
		const l = pick(src);
		const r = pick(dst);
		for (const item of new Set([...l, ...r])) {
			rows.push({
				key: `${label}:${item}`,
				left: l.includes(item) ? `${label} ${item}` : undefined,
				right: r.includes(item) ? `${label} ${item}` : undefined,
				status:
					l.includes(item) && r.includes(item)
						? "same"
						: l.includes(item)
							? "added"
							: "dropped",
			});
		}
	};
	extras((t) => t?.indexes ?? [], "index");
	extras((t) => t?.fks ?? [], "fk");
	return rows;
};

export const VariantB = ({ from, to, onFrom, onTo }: VariantProps) => {
	const [acceptRename, setAcceptRename] = useState(false);
	const [hideSame, setHideSame] = useState(true);
	const [sqlOpen, setSqlOpen] = useState(false);
	const script = toScript(buildChanges(acceptRename));
	const tables = [...new Set([...FROM_SNAPSHOT, ...TO_SNAPSHOT].map((t) => t.name))].sort();

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<CompareHeader
				from={from}
				to={to}
				onFrom={onFrom}
				onTo={onTo}
				script={script}
			>
				<label
					htmlFor="hide-unchanged"
					className="ml-3 flex items-center gap-2 text-xs text-muted-foreground"
				>
					<Switch
						id="hide-unchanged"
						checked={hideSame}
						onCheckedChange={setHideSame}
					/>
					Hide unchanged
				</label>
			</CompareHeader>

			<div className="grid grid-cols-2 shrink-0 border-b border-border text-xs font-medium">
				<div className="px-3 h-7 flex items-center border-r border-border">
					{from} <span className="ml-1.5 text-muted-foreground font-normal">source</span>
				</div>
				<div className="px-3 h-7 flex items-center">
					{to} <span className="ml-1.5 text-muted-foreground font-normal">target</span>
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-auto font-mono text-xs">
				{tables.map((table) => {
					const rows = buildRows(table, acceptRename);
					const changed = rows.some((r) => r.status !== "same");
					if (hideSame && !changed) return null;
					const inSrc = FROM_SNAPSHOT.some((t) => t.name === table);
					const inDst = TO_SNAPSHOT.some((t) => t.name === table);
					const tableStatus: Status = !inDst
						? "added"
						: !inSrc
							? "dropped"
							: changed
								? "changed"
								: "same";

					return (
						<section key={table}>
							<div
								className={cn(
									"sticky top-0 z-10 px-3 h-7 flex items-center gap-2 border-y border-border bg-background font-sans font-medium",
								)}
							>
								<span className="w-3 text-muted-foreground">{MARK[tableStatus]}</span>
								{table}
								{tableStatus === "added" && (
									<span className="text-emerald-600 dark:text-emerald-400 font-normal">
										new table
									</span>
								)}
								{tableStatus === "dropped" && (
									<span className="text-red-600 dark:text-red-400 font-normal">
										only in target · will be dropped
									</span>
								)}
							</div>
							{rows
								.filter((r) => !hideSame || r.status !== "same")
								.map((r) => {
									const isCandidate =
										!acceptRename &&
										table === RENAME_CANDIDATE.table &&
										(r.key === RENAME_CANDIDATE.from || r.key === RENAME_CANDIDATE.to);
									return (
										<div
											key={r.key}
											className={cn("grid grid-cols-2 leading-6", ROW_STYLE[r.status])}
										>
											<div className="px-3 border-r border-border flex gap-2 min-w-0">
												<span className="w-3 text-muted-foreground">
													{r.left ? MARK[r.status] : ""}
												</span>
												<span className="truncate">{r.left}</span>
											</div>
											<div className="px-3 flex gap-2 min-w-0 items-center">
												<span className="w-3 text-muted-foreground">
													{r.right && r.status !== "same" ? (r.left ? "~" : "−") : ""}
												</span>
												<span className="truncate">{r.right}</span>
												{r.rename && (
													<span className="ml-auto font-sans text-amber-600 dark:text-amber-400">
														renamed
													</span>
												)}
												{isCandidate && r.key === RENAME_CANDIDATE.from && (
													<button
														type="button"
														className="ml-auto flex items-center gap-1 font-sans underline underline-offset-2"
														onClick={() => setAcceptRename(true)}
													>
														<Link2 className="size-3" />
														Pair with {RENAME_CANDIDATE.to} as rename
													</button>
												)}
											</div>
										</div>
									);
								})}
						</section>
					);
				})}
			</div>

			<div
				className={cn(
					"shrink-0 border-t border-border flex flex-col",
					sqlOpen ? "h-64" : "h-9",
				)}
			>
				<button
					type="button"
					className="h-9 shrink-0 px-2 flex items-center justify-between text-xs text-muted-foreground hover:text-foreground"
					onClick={() => setSqlOpen(!sqlOpen)}
				>
					<span>Migration SQL · {script.split("\n").length} lines</span>
					{sqlOpen ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
				</button>
				{sqlOpen && (
					<div className="min-h-0 flex-1 overflow-auto bg-muted/20 border-t border-border">
						<SqlBlock
							sql={script}
							className="py-2"
						/>
					</div>
				)}
			</div>
		</div>
	);
};
