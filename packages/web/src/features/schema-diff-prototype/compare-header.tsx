// PROTOTYPE — throwaway. Source/target pickers shared by every variant; they only change labels.
import { Button } from "@db-studio/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@db-studio/ui/select";
import { ArrowRight, Copy, Download } from "lucide-react";
import type { ReactNode } from "react";
import { useDatabasesList } from "@/hooks/use-databases-list";
import { FROM_DB, TO_DB } from "./fixture";

const toolbarButton =
	"h-8! px-2.5 border-l border-y-0 border-r-0 border-border rounded-none text-xs font-medium gap-1.5 flex items-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors";

const DbSelect = ({
	value,
	onChange,
	names,
}: {
	value: string;
	onChange: (v: string) => void;
	names: string[];
}) => (
	<Select
		value={value}
		onValueChange={onChange}
	>
		<SelectTrigger className="h-8! w-40 rounded-none border-0 border-r border-border text-xs shadow-none">
			<SelectValue />
		</SelectTrigger>
		<SelectContent>
			{names.map((n) => (
				<SelectItem
					key={n}
					value={n}
				>
					{n}
				</SelectItem>
			))}
		</SelectContent>
	</Select>
);

export const useComparePair = () => {
	const { databases } = useDatabasesList();
	const names = [...new Set([FROM_DB, TO_DB, ...(databases ?? []).map((d) => d.name)])];
	return { names };
};

export const CompareHeader = ({
	from,
	to,
	onFrom,
	onTo,
	script,
	readOnly = false,
	children,
}: {
	from: string;
	to: string;
	onFrom: (v: string) => void;
	onTo: (v: string) => void;
	script: string;
	readOnly?: boolean;
	children?: ReactNode;
}) => {
	const { names } = useComparePair();

	const download = () => {
		const url = URL.createObjectURL(new Blob([script], { type: "text/sql" }));
		const a = document.createElement("a");
		a.href = url;
		a.download = `${to}-to-match-${from}.sql`;
		a.click();
		URL.revokeObjectURL(url);
	};

	return (
		<header className="h-8 shrink-0 border-b border-border w-full flex items-center justify-between bg-background">
			<div className="flex items-center">
				<span className="px-2.5 text-xs text-muted-foreground border-r border-border h-8 flex items-center">
					Source
				</span>
				{readOnly ? (
					<span className="w-40 px-3 text-xs">{from}</span>
				) : (
					<DbSelect
						value={from}
						onChange={onFrom}
						names={names}
					/>
				)}
				<ArrowRight className="size-3.5 mx-2 text-muted-foreground" />
				<span className="px-2.5 text-xs text-muted-foreground border-x border-border h-8 flex items-center">
					Target
				</span>
				{readOnly ? (
					<span className="w-40 px-3 text-xs">{to}</span>
				) : (
					<DbSelect
						value={to}
						onChange={onTo}
						names={names}
					/>
				)}
				{children}
			</div>
			<div className="flex items-center">
				<Button
					type="button"
					variant="ghost"
					className={toolbarButton}
					onClick={() => navigator.clipboard.writeText(script)}
				>
					<Copy className="size-3.5" />
					Copy SQL
				</Button>
				<Button
					type="button"
					variant="ghost"
					className={toolbarButton}
					onClick={download}
				>
					<Download className="size-3.5" />
					Download .sql
				</Button>
			</div>
		</header>
	);
};

// Token colors match the query runner, which uses Monaco's stock vs / vs-dark SQL colors.
const SQL_KEYWORDS = new Set(
	"ADD ALTER BEGIN BIGINT BOOLEAN COLUMN COMMIT CONSTRAINT CREATE DEFAULT DROP FOREIGN INDEX INTEGER KEY NOT NULL NUMERIC ON PRIMARY REFERENCES RENAME SERIAL TABLE TEXT TIMESTAMPTZ TO TYPE UNIQUE VARCHAR".split(
		" ",
	),
);

const TOKEN_STYLE = {
	keyword: "text-[#0000ff] dark:text-[#569cd6]",
	string: "text-[#a31515] dark:text-[#ce9178]",
	number: "text-[#098658] dark:text-[#b5cea8]",
	comment: "text-[#008000] dark:text-[#6a9955]",
	plain: "",
};

const tokenize = (line: string) =>
	[
		...line.matchAll(
			/--.*$|'[^']*'?|"[^"]*"?|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b|[^'"\w-]+|-/g,
		),
	].map(([text]) => {
		const kind: keyof typeof TOKEN_STYLE = text.startsWith("--")
			? "comment"
			: text.startsWith("'")
				? "string"
				: /^\d/.test(text)
					? "number"
					: SQL_KEYWORDS.has(text.toUpperCase())
						? "keyword"
						: "plain";
		return { text, kind };
	});

export const SqlBlock = ({ sql, className }: { sql: string; className?: string }) => (
	<pre className={`font-mono text-xs leading-5 ${className ?? ""}`}>
		{sql.split("\n").map((line, i) => (
			<div
				key={i}
				className="flex"
			>
				<span className="w-8 shrink-0 pr-3 text-right text-muted-foreground/60 select-none">
					{i + 1}
				</span>
				{/* Long statements wrap under their own line instead of spilling past the border. */}
				<code className="min-w-0 flex-1 whitespace-pre-wrap [overflow-wrap:anywhere] pr-3">
					{tokenize(line).map((t, j) => (
						<span
							key={j}
							className={TOKEN_STYLE[t.kind]}
						>
							{t.text}
						</span>
					))}
				</code>
			</div>
		))}
	</pre>
);
