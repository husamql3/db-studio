import type {
	EncodedRedisValueSchemaType,
	KeyActionSchemaType,
	KeyDetailsResultSchemaType,
} from "@db-studio/shared/types";
import { Alert } from "@db-studio/ui/alert";
import { Button } from "@db-studio/ui/button";
import { Field, FieldLabel } from "@db-studio/ui/field";
import { Input } from "@db-studio/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@db-studio/ui/toggle-group";
import { Plus, Save, Search, Trash2 } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { RedisCopyButton } from "./redis-copy-button";
import { encodeTextValue, RedisValue, RedisValueInput } from "./redis-value";

/**
 * Runs one key operation against the server. Resolves `true` on success so
 * add-forms know when to clear; conflict handling lives in the screen.
 */
export type RedisAct = (
	operation: KeyActionSchemaType["operation"],
	force?: boolean,
) => Promise<boolean>;

export type StreamDirection = "forward" | "backward";

type RedisValueUnion = KeyDetailsResultSchemaType["value"];
type HashValue = Extract<RedisValueUnion, { kind: "hash" }>;
type ListValue = Extract<RedisValueUnion, { kind: "list" }>;
type SetValue = Extract<RedisValueUnion, { kind: "set" }>;
type ZsetValue = Extract<RedisValueUnion, { kind: "zset" }>;
type StreamValue = Extract<RedisValueUnion, { kind: "stream" }>;

const emptyValue = encodeTextValue("");

/** `null` = the input's visible draft is unparseable and MUST NOT be submitted. */
type DraftValue = EncodedRedisValueSchemaType | null;

const textOf = (value: EncodedRedisValueSchemaType): string =>
	value.utf8 ?? `base64:${value.base64}`;

const matches = (needle: string, ...haystack: (string | number)[]): boolean =>
	haystack.some((part) => String(part).toLowerCase().includes(needle));

/** Serializes the loaded (client-side) entries so devs can yank them into code. */
const collectionJson = (value: RedisValueUnion): string => {
	switch (value.kind) {
		case "string":
			return JSON.stringify(textOf(value.value), null, 2);
		case "hash":
			return JSON.stringify(
				Object.fromEntries(
					value.entries.map((entry) => [textOf(entry.field), textOf(entry.value)]),
				),
				null,
				2,
			);
		case "list":
			return JSON.stringify(
				value.entries.map((entry) => textOf(entry.value)),
				null,
				2,
			);
		case "set":
			return JSON.stringify(value.members.map(textOf), null, 2);
		case "zset":
			return JSON.stringify(
				value.entries.map((entry) => ({ member: textOf(entry.member), score: entry.score })),
				null,
				2,
			);
		case "stream":
			return JSON.stringify(
				value.entries.map((entry) => ({
					id: entry.id,
					fields: Object.fromEntries(
						entry.fields.map((field) => [textOf(field.field), textOf(field.value)]),
					),
				})),
				null,
				2,
			);
		default:
			return "";
	}
};

/**
 * Local draft that re-syncs whenever the server value changes (identified by
 * `revision`), without wiping unrelated drafts on every refetch.
 */
const useSyncedDraft = <T,>(server: T, revision: string): [T, (next: T) => void] => {
	const [draft, setDraft] = useState(server);
	const [synced, setSynced] = useState(revision);
	if (synced !== revision) {
		setSynced(revision);
		setDraft(server);
	}
	return [draft, setDraft];
};

const EmptyRow = ({ filtered }: { filtered: boolean }) => (
	<div className="flex h-10 items-center justify-center px-2 text-xs text-muted-foreground">
		{filtered ? "No loaded entries match the filter." : "No entries loaded."}
	</div>
);

/**
 * Frame around every collection editor: a client-side filter over the loaded
 * entries, a loaded/total counter, copy-as-JSON, and an optional `extra` slot
 * (e.g. the stream direction toggle).
 */
const CollectionShell = ({
	filter,
	onFilterChange,
	shownCount,
	loadedCount,
	totalCount,
	copyJson,
	extra,
	header,
	children,
	footer,
}: {
	filter: string;
	onFilterChange: (next: string) => void;
	shownCount: number;
	loadedCount: number;
	totalCount: number | null;
	copyJson: () => string;
	extra?: ReactNode;
	header: ReactNode;
	children: ReactNode;
	footer: ReactNode;
}) => (
	<div className="overflow-hidden border border-border">
		<div className="flex h-8 items-center gap-1 border-b border-border bg-muted/10 px-1">
			<Search className="ms-1 size-3 shrink-0 text-muted-foreground" />
			<Input
				variant="outline"
				value={filter}
				onChange={(event) => onFilterChange(event.target.value)}
				placeholder="Filter loaded entries"
				aria-label="Filter loaded entries"
				className="h-6 flex-1 rounded-none border-none px-1 font-mono focus-visible:ring-0"
			/>
			{extra}
			<span className="shrink-0 px-1 text-[10px] tabular-nums text-muted-foreground">
				{filter
					? `${shownCount} / ${loadedCount}`
					: totalCount !== null && totalCount > loadedCount
						? `${loadedCount.toLocaleString()} of ${totalCount.toLocaleString()}`
						: loadedCount.toLocaleString()}
			</span>
			<RedisCopyButton
				text={copyJson}
				label="Copy loaded entries as JSON"
			/>
		</div>
		{header}
		{children}
		{footer}
	</div>
);

const AddPair = ({
	labels,
	onSave,
	pending,
	score = false,
}: {
	labels: [string, string];
	onSave: (
		first: EncodedRedisValueSchemaType,
		second: EncodedRedisValueSchemaType | number,
	) => Promise<boolean>;
	pending: boolean;
	score?: boolean;
}) => {
	const [first, setFirst] = useState<DraftValue>(emptyValue);
	const [second, setSecond] = useState<DraftValue>(emptyValue);
	const [numeric, setNumeric] = useState("0");
	const invalid = first === null || (!score && second === null);
	const submit = async (event: FormEvent) => {
		event.preventDefault();
		if (first === null || second === null) return;
		const saved = await onSave(first, score ? Number(numeric) : second);
		if (!saved) return;
		setFirst(emptyValue);
		setSecond(emptyValue);
		setNumeric("0");
	};
	return (
		<form
			onSubmit={submit}
			className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 border-t border-border bg-muted/10 p-2"
		>
			<RedisValueInput
				value={first}
				onChange={setFirst}
				placeholder={labels[0]}
			/>
			{score ? (
				<Input
					type="number"
					step="any"
					value={numeric}
					onChange={(event) => setNumeric(event.target.value)}
					placeholder={labels[1]}
					className="font-mono"
				/>
			) : (
				<RedisValueInput
					value={second}
					onChange={setSecond}
					placeholder={labels[1]}
				/>
			)}
			<Button
				type="submit"
				disabled={pending || invalid}
			>
				<Plus /> Add
			</Button>
		</form>
	);
};

const StringEditor = ({
	value,
	truncated,
	act,
	pending,
	onLoadFull,
	onDownload,
}: {
	value: EncodedRedisValueSchemaType;
	truncated: boolean;
	act: RedisAct;
	pending: boolean;
	onLoadFull: () => void;
	onDownload: () => void;
}) => {
	const [draft, setDraft] = useSyncedDraft<DraftValue>(value, value.base64);
	const dirty = draft !== null && draft.base64 !== value.base64;
	return (
		<div className="space-y-3">
			{truncated && (
				<div className="grid gap-2 border-b border-border pb-3 sm:grid-cols-[1fr_auto] sm:items-center">
					<Alert
						variant="warning"
						title="Preview truncated"
						message="Load the full value before editing (up to the 8 MiB response cap)."
						className="rounded-sm"
					/>
					<Button
						variant="outline"
						onClick={onLoadFull}
					>
						Load full
					</Button>
				</div>
			)}
			<RedisValue
				value={value}
				onDownload={onDownload}
			/>
			<form
				onSubmit={(event) => {
					event.preventDefault();
					if (draft !== null && dirty) act({ action: "setString", value: draft });
				}}
				className="border border-border p-3"
			>
				<Field className="gap-1.5">
					<FieldLabel htmlFor="redis-string-value">Replace value</FieldLabel>
					<RedisValueInput
						id="redis-string-value"
						value={draft}
						onChange={setDraft}
					/>
				</Field>
				<Button
					type="submit"
					className="mt-3"
					disabled={truncated || pending || !dirty}
				>
					<Save /> Save value
				</Button>
			</form>
		</div>
	);
};

const HashRow = ({
	field,
	value,
	act,
	pending,
}: {
	field: EncodedRedisValueSchemaType;
	value: EncodedRedisValueSchemaType;
	act: RedisAct;
	pending: boolean;
}) => {
	const [draft, setDraft] = useSyncedDraft<DraftValue>(value, value.base64);
	const dirty = draft !== null && draft.base64 !== value.base64;
	return (
		<div className="grid min-h-8 grid-cols-[minmax(10rem,0.7fr)_1fr_5rem] items-center gap-2 border-b border-border px-2 py-1">
			<RedisValue
				value={field}
				compact
			/>
			<RedisValueInput
				value={draft}
				onChange={setDraft}
			/>
			<div className="flex">
				<Button
					variant="ghost"
					size="icon-sm"
					className={dirty ? "text-primary" : undefined}
					disabled={pending || !dirty}
					onClick={() => draft !== null && act({ action: "upsertHash", field, value: draft })}
					aria-label="Save hash value"
				>
					<Save />
				</Button>
				<Button
					variant="ghost"
					size="icon-sm"
					className="text-muted-foreground hover:text-destructive"
					disabled={pending}
					onClick={() => act({ action: "deleteHash", field })}
					aria-label="Delete hash field"
				>
					<Trash2 />
				</Button>
			</div>
		</div>
	);
};

const HashEditor = ({
	value,
	total,
	act,
	pending,
}: {
	value: HashValue;
	total: number | null;
	act: RedisAct;
	pending: boolean;
}) => {
	const [filter, setFilter] = useState("");
	const needle = filter.trim().toLowerCase();
	const entries = needle
		? value.entries.filter((entry) =>
				matches(needle, textOf(entry.field), textOf(entry.value)),
			)
		: value.entries;
	return (
		<CollectionShell
			filter={filter}
			onFilterChange={setFilter}
			shownCount={entries.length}
			loadedCount={value.entries.length}
			totalCount={total}
			copyJson={() => collectionJson(value)}
			header={
				<div className="grid h-8 grid-cols-[minmax(10rem,0.7fr)_1fr_5rem] items-center border-b border-border bg-muted/20 px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
					<span>Field</span>
					<span>Value</span>
					<span />
				</div>
			}
			footer={
				<AddPair
					labels={["field", "value"]}
					pending={pending}
					onSave={(field, next) =>
						act({ action: "upsertHash", field, value: next as EncodedRedisValueSchemaType })
					}
				/>
			}
		>
			{entries.length === 0 ? (
				<EmptyRow filtered={needle.length > 0} />
			) : (
				entries.map((entry) => (
					<HashRow
						key={entry.field.base64}
						field={entry.field}
						value={entry.value}
						act={act}
						pending={pending}
					/>
				))
			)}
		</CollectionShell>
	);
};

const ListRow = ({
	index,
	value,
	act,
	pending,
}: {
	index: number;
	value: EncodedRedisValueSchemaType;
	act: RedisAct;
	pending: boolean;
}) => {
	const [draft, setDraft] = useSyncedDraft<DraftValue>(value, value.base64);
	const dirty = draft !== null && draft.base64 !== value.base64;
	return (
		<div className="grid min-h-8 grid-cols-[3rem_1fr_5rem] items-center gap-2 border-b border-border px-2 py-1">
			<code className="text-xs text-muted-foreground">{index}</code>
			<RedisValueInput
				value={draft}
				onChange={setDraft}
			/>
			<div className="flex">
				<Button
					variant="ghost"
					size="icon-sm"
					className={dirty ? "text-primary" : undefined}
					disabled={pending || !dirty}
					onClick={() => draft !== null && act({ action: "setList", index, value: draft })}
					aria-label={`Save list item ${index}`}
				>
					<Save />
				</Button>
				<Button
					variant="ghost"
					size="icon-sm"
					className="text-muted-foreground hover:text-destructive"
					disabled={pending}
					onClick={() => act({ action: "deleteList", index })}
					aria-label={`Delete list item ${index}`}
				>
					<Trash2 />
				</Button>
			</div>
		</div>
	);
};

const ListEditor = ({
	value,
	total,
	act,
	pending,
}: {
	value: ListValue;
	total: number | null;
	act: RedisAct;
	pending: boolean;
}) => {
	const [filter, setFilter] = useState("");
	const [item, setItem] = useState<DraftValue>(emptyValue);
	const needle = filter.trim().toLowerCase();
	const entries = needle
		? value.entries.filter((entry) => matches(needle, entry.index, textOf(entry.value)))
		: value.entries;
	const push = async (side: "left" | "right") => {
		if (item === null) return;
		const saved = await act({ action: "pushList", side, value: item });
		if (saved) setItem(emptyValue);
	};
	return (
		<CollectionShell
			filter={filter}
			onFilterChange={setFilter}
			shownCount={entries.length}
			loadedCount={value.entries.length}
			totalCount={total}
			copyJson={() => collectionJson(value)}
			header={
				<div className="grid h-8 grid-cols-[3rem_1fr_5rem] items-center border-b border-border bg-muted/20 px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
					<span>Index</span>
					<span>Value</span>
					<span />
				</div>
			}
			footer={
				<form
					onSubmit={(event) => {
						event.preventDefault();
						push("right");
					}}
					className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-t border-border bg-muted/10 p-2"
				>
					<RedisValueInput
						value={item}
						onChange={setItem}
						placeholder="new item"
					/>
					<Button
						type="button"
						variant="outline"
						disabled={pending || item === null}
						onClick={() => push("left")}
					>
						Push left
					</Button>
					<Button
						type="submit"
						disabled={pending || item === null}
					>
						Push right
					</Button>
				</form>
			}
		>
			{entries.length === 0 ? (
				<EmptyRow filtered={needle.length > 0} />
			) : (
				entries.map((entry) => (
					<ListRow
						key={entry.index}
						index={entry.index}
						value={entry.value}
						act={act}
						pending={pending}
					/>
				))
			)}
		</CollectionShell>
	);
};

const SetEditor = ({
	value,
	total,
	act,
	pending,
}: {
	value: SetValue;
	total: number | null;
	act: RedisAct;
	pending: boolean;
}) => {
	const [filter, setFilter] = useState("");
	const [member, setMember] = useState<DraftValue>(emptyValue);
	const needle = filter.trim().toLowerCase();
	const members = needle
		? value.members.filter((entry) => matches(needle, textOf(entry)))
		: value.members;
	return (
		<CollectionShell
			filter={filter}
			onFilterChange={setFilter}
			shownCount={members.length}
			loadedCount={value.members.length}
			totalCount={total}
			copyJson={() => collectionJson(value)}
			header={
				<div className="grid h-8 grid-cols-[1fr_2rem] items-center border-b border-border bg-muted/20 px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
					<span>Member</span>
					<span />
				</div>
			}
			footer={
				<form
					onSubmit={async (event) => {
						event.preventDefault();
						if (member === null) return;
						const saved = await act({ action: "addSet", member });
						if (saved) setMember(emptyValue);
					}}
					className="grid grid-cols-[1fr_auto] items-center gap-2 border-t border-border bg-muted/10 p-2"
				>
					<RedisValueInput
						value={member}
						onChange={setMember}
						placeholder="new member"
					/>
					<Button
						type="submit"
						disabled={pending || member === null}
					>
						<Plus /> Add member
					</Button>
				</form>
			}
		>
			{members.length === 0 ? (
				<EmptyRow filtered={needle.length > 0} />
			) : (
				members.map((entry) => (
					<div
						key={entry.base64}
						className="flex min-h-8 items-center gap-2 border-b border-border px-2 py-1"
					>
						<span className="min-w-0 flex-1">
							<RedisValue
								value={entry}
								compact
							/>
						</span>
						<Button
							variant="ghost"
							size="icon-sm"
							className="text-muted-foreground hover:text-destructive"
							disabled={pending}
							onClick={() => act({ action: "removeSet", member: entry })}
							aria-label="Remove set member"
						>
							<Trash2 />
						</Button>
					</div>
				))
			)}
		</CollectionShell>
	);
};

const ZsetRow = ({
	member,
	score,
	act,
	pending,
}: {
	member: EncodedRedisValueSchemaType;
	score: number;
	act: RedisAct;
	pending: boolean;
}) => {
	const [draft, setDraft] = useSyncedDraft(String(score), String(score));
	const dirty = Number(draft) !== score;
	return (
		<div className="grid min-h-8 grid-cols-[1fr_8rem_5rem] items-center gap-2 border-b border-border px-2 py-1">
			<RedisValue
				value={member}
				compact
			/>
			<Input
				type="number"
				step="any"
				value={draft}
				onChange={(event) => setDraft(event.target.value)}
				aria-label="Sorted set score"
				className="font-mono"
			/>
			<div className="flex">
				<Button
					variant="ghost"
					size="icon-sm"
					className={dirty ? "text-primary" : undefined}
					disabled={pending || !dirty}
					onClick={() => act({ action: "upsertZset", member, score: Number(draft) })}
					aria-label="Save sorted set score"
				>
					<Save />
				</Button>
				<Button
					variant="ghost"
					size="icon-sm"
					className="text-muted-foreground hover:text-destructive"
					disabled={pending}
					onClick={() => act({ action: "removeZset", member })}
					aria-label="Remove sorted set member"
				>
					<Trash2 />
				</Button>
			</div>
		</div>
	);
};

const ZsetEditor = ({
	value,
	total,
	act,
	pending,
}: {
	value: ZsetValue;
	total: number | null;
	act: RedisAct;
	pending: boolean;
}) => {
	const [filter, setFilter] = useState("");
	const needle = filter.trim().toLowerCase();
	const entries = needle
		? value.entries.filter((entry) => matches(needle, textOf(entry.member), entry.score))
		: value.entries;
	return (
		<CollectionShell
			filter={filter}
			onFilterChange={setFilter}
			shownCount={entries.length}
			loadedCount={value.entries.length}
			totalCount={total}
			copyJson={() => collectionJson(value)}
			header={
				<div className="grid h-8 grid-cols-[1fr_8rem_5rem] items-center border-b border-border bg-muted/20 px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
					<span>Member</span>
					<span>Score</span>
					<span />
				</div>
			}
			footer={
				<AddPair
					score
					labels={["member", "score"]}
					pending={pending}
					onSave={(member, score) =>
						act({ action: "upsertZset", member, score: score as number })
					}
				/>
			}
		>
			{entries.length === 0 ? (
				<EmptyRow filtered={needle.length > 0} />
			) : (
				entries.map((entry) => (
					<ZsetRow
						key={entry.member.base64}
						member={entry.member}
						score={entry.score}
						act={act}
						pending={pending}
					/>
				))
			)}
		</CollectionShell>
	);
};

const StreamEditor = ({
	value,
	total,
	act,
	pending,
	direction,
	onDirectionChange,
}: {
	value: StreamValue;
	total: number | null;
	act: RedisAct;
	pending: boolean;
	direction: StreamDirection;
	onDirectionChange: (direction: StreamDirection) => void;
}) => {
	const [filter, setFilter] = useState("");
	const needle = filter.trim().toLowerCase();
	const entries = needle
		? value.entries.filter((entry) =>
				matches(
					needle,
					entry.id,
					...entry.fields.flatMap((field) => [textOf(field.field), textOf(field.value)]),
				),
			)
		: value.entries;
	return (
		<CollectionShell
			filter={filter}
			onFilterChange={setFilter}
			shownCount={entries.length}
			loadedCount={value.entries.length}
			totalCount={total}
			copyJson={() => collectionJson(value)}
			extra={
				<ToggleGroup
					type="single"
					variant="ghost"
					size="sm"
					value={direction}
					onValueChange={(next) => next && onDirectionChange(next as StreamDirection)}
					aria-label="Stream order"
					className="shrink-0 rounded-none"
				>
					<ToggleGroupItem
						value="forward"
						className="h-6 rounded-none px-2 text-[10px]"
					>
						Oldest first
					</ToggleGroupItem>
					<ToggleGroupItem
						value="backward"
						className="h-6 rounded-none px-2 text-[10px]"
					>
						Newest first
					</ToggleGroupItem>
				</ToggleGroup>
			}
			header={
				<div className="grid h-8 grid-cols-[10rem_1fr_2rem] items-center border-b border-border bg-muted/20 px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
					<span>Entry ID</span>
					<span>Fields</span>
					<span />
				</div>
			}
			footer={
				<AddPair
					labels={["field", "value"]}
					pending={pending}
					onSave={(field, next) =>
						act({
							action: "appendStream",
							id: "*",
							fields: [{ field, value: next as EncodedRedisValueSchemaType }],
						})
					}
				/>
			}
		>
			{entries.length === 0 ? (
				<EmptyRow filtered={needle.length > 0} />
			) : (
				entries.map((entry) => (
					<div
						key={entry.id}
						className="grid grid-cols-[10rem_1fr_2rem] border-b border-border"
					>
						<code className="border-e border-border px-2 py-1.5 text-xs text-primary">
							{entry.id}
						</code>
						<div className="grid gap-1 px-2 py-1.5">
							{entry.fields.map((field) => (
								<div
									key={field.field.base64}
									className="grid grid-cols-[minmax(8rem,0.4fr)_1fr] gap-3"
								>
									<RedisValue
										value={field.field}
										compact
									/>
									<RedisValue
										value={field.value}
										compact
									/>
								</div>
							))}
						</div>
						<Button
							variant="ghost"
							size="icon-sm"
							className="rounded-none text-muted-foreground hover:text-destructive"
							disabled={pending}
							onClick={() => act({ action: "deleteStream", id: entry.id })}
							aria-label={`Delete stream entry ${entry.id}`}
						>
							<Trash2 />
						</Button>
					</div>
				))
			)}
		</CollectionShell>
	);
};

/** Dispatches the loaded key to the editor matching its Redis type. */
export const RedisValueEditor = ({
	detail,
	act,
	pending,
	onLoadFull,
	onDownload,
	streamDirection,
	onStreamDirectionChange,
}: {
	detail: KeyDetailsResultSchemaType;
	act: RedisAct;
	pending: boolean;
	onLoadFull: () => void;
	onDownload: () => void;
	streamDirection: StreamDirection;
	onStreamDirectionChange: (direction: StreamDirection) => void;
}) => {
	const value = detail.value;
	switch (value.kind) {
		case "string":
			return (
				<StringEditor
					value={value.value}
					truncated={value.truncated}
					act={act}
					pending={pending}
					onLoadFull={onLoadFull}
					onDownload={onDownload}
				/>
			);
		case "hash":
			return (
				<HashEditor
					value={value}
					total={detail.length}
					act={act}
					pending={pending}
				/>
			);
		case "list":
			return (
				<ListEditor
					value={value}
					total={detail.length}
					act={act}
					pending={pending}
				/>
			);
		case "set":
			return (
				<SetEditor
					value={value}
					total={detail.length}
					act={act}
					pending={pending}
				/>
			);
		case "zset":
			return (
				<ZsetEditor
					value={value}
					total={detail.length}
					act={act}
					pending={pending}
				/>
			);
		case "stream":
			return (
				<StreamEditor
					value={value}
					total={detail.length}
					act={act}
					pending={pending}
					direction={streamDirection}
					onDirectionChange={onStreamDirectionChange}
				/>
			);
		default:
			return (
				<Alert
					variant="info"
					title="Metadata only"
					message="This Redis module type cannot be edited in this release."
					className="rounded-sm"
				/>
			);
	}
};
