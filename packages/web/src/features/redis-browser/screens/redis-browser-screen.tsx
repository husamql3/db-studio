import type {
	EncodedRedisValueSchemaType,
	KeyActionSchemaType,
	KeyDetailsResultSchemaType,
} from "@db-studio/shared/types";
import { Alert } from "@db-studio/ui/alert";
import { Badge } from "@db-studio/ui/badge";
import { Button } from "@db-studio/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@db-studio/ui/field";
import { Input } from "@db-studio/ui/input";
import { Spinner } from "@db-studio/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@db-studio/ui/toggle-group";
import { cn } from "@db-studio/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import {
	ArrowRight,
	DatabaseZap,
	Plus,
	RefreshCw,
	Save,
	Terminal,
	Trash2,
} from "lucide-react";
import { useQueryState } from "nuqs";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getRedisStringChunk } from "@/shared/api";
import { useDatabaseStore } from "@/stores/database.store";
import { useOverlayStore } from "@/stores/overlay.store";
import {
	bytesFromBase64Url,
	encodeTextValue,
	RedisValue,
	RedisValueInput,
} from "../components/redis-value";
import { useRedisKey, useRedisKeyMutations } from "../hooks/use-redis-browser";

const emptyValue = encodeTextValue("");

const formatBytes = (bytes: number | null): string => {
	if (bytes === null) return "unavailable";
	if (bytes < 1_024) return `${bytes} B`;
	if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KiB`;
	return `${(bytes / 1_048_576).toFixed(1)} MiB`;
};

const formatTtl = (ttlMs: number): string => {
	if (ttlMs === -1) return "Persistent";
	if (ttlMs < 0) return "Expired";
	const seconds = Math.ceil(ttlMs / 1_000);
	if (seconds < 60) return `${seconds}s`;
	if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
	return `${Math.floor(seconds / 3_600)}h ${Math.floor((seconds % 3_600) / 60)}m`;
};

const runnerCommand = (detail: KeyDetailsResultSchemaType): string | null => {
	if (detail.key.utf8 === undefined) return null;
	const key = JSON.stringify(detail.key.utf8);
	switch (detail.type) {
		case "string":
			return `GET ${key}`;
		case "hash":
			return `HGETALL ${key}`;
		case "list":
			return `LRANGE ${key} 0 -1`;
		case "set":
			return `SMEMBERS ${key}`;
		case "zset":
			return `ZRANGE ${key} 0 -1 WITHSCORES`;
		case "stream":
			return `XRANGE ${key} - + COUNT 100`;
		default:
			return null;
	}
};

const AddPair = ({
	labels,
	onSave,
	score = false,
}: {
	labels: [string, string];
	onSave: (
		first: EncodedRedisValueSchemaType,
		second: EncodedRedisValueSchemaType | number,
	) => Promise<unknown>;
	score?: boolean;
}) => {
	const [first, setFirst] = useState(emptyValue);
	const [second, setSecond] = useState(emptyValue);
	const [numeric, setNumeric] = useState("0");
	return (
		<div className="grid grid-cols-[1fr_1fr_auto] gap-2 border-t border-border bg-muted/10 p-2">
			<RedisValueInput
				value={first}
				onChange={setFirst}
				placeholder={labels[0]}
			/>
			{score ? (
				<Input
					type="number"
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
				size="sm"
				className="h-7"
				onClick={() => onSave(first, score ? Number(numeric) : second)}
			>
				<Save /> Add
			</Button>
		</div>
	);
};

const ValueEditor = ({
	detail,
	act,
	onLoadFull,
	onDownload,
}: {
	detail: KeyDetailsResultSchemaType;
	act: (operation: KeyActionSchemaType["operation"]) => Promise<unknown>;
	onLoadFull: () => void;
	onDownload: () => void;
}) => {
	const value = detail.value;
	if (value.kind === "string")
		return (
			<StringEditor
				value={value.value}
				truncated={value.truncated}
				act={act}
				onLoadFull={onLoadFull}
				onDownload={onDownload}
			/>
		);
	if (value.kind === "hash")
		return (
			<div className="overflow-hidden border border-border">
				<div className="grid h-8 grid-cols-[minmax(10rem,0.7fr)_1fr_5rem] items-center border-b border-border bg-muted/20 px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
					<span>Field</span>
					<span>Value</span>
					<span />
				</div>
				{value.entries.map((entry) => (
					<HashRow
						key={entry.field.base64}
						field={entry.field}
						value={entry.value}
						act={act}
					/>
				))}
				<AddPair
					labels={["field", "value"]}
					onSave={(field, next) =>
						act({ action: "upsertHash", field, value: next as EncodedRedisValueSchemaType })
					}
				/>
			</div>
		);
	if (value.kind === "list")
		return (
			<div className="overflow-hidden border border-border">
				<div className="grid h-8 grid-cols-[3rem_1fr_5rem] items-center border-b border-border bg-muted/20 px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
					<span>Index</span>
					<span>Value</span>
					<span />
				</div>
				{value.entries.map((entry) => (
					<ListRow
						key={entry.index}
						index={entry.index}
						value={entry.value}
						act={act}
					/>
				))}
				<div className="grid grid-cols-[1fr_auto_auto] gap-2 border-t border-border bg-muted/10 p-2">
					<ListAdd act={act} />
				</div>
			</div>
		);
	if (value.kind === "set")
		return (
			<div className="overflow-hidden border border-border">
				<div className="grid h-8 grid-cols-[1fr_2rem] items-center border-b border-border bg-muted/20 px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
					<span>Member</span>
					<span />
				</div>
				{value.members.map((member) => (
					<div
						key={member.base64}
						className="flex min-h-8 items-center gap-2 border-b border-border px-2 py-1"
					>
						<span className="min-w-0 flex-1">
							<RedisValue
								value={member}
								compact
							/>
						</span>
						<Button
							variant="ghost"
							size="icon-sm"
							className="text-muted-foreground hover:text-destructive"
							onClick={() => act({ action: "removeSet", member })}
							aria-label="Remove set member"
						>
							<Trash2 />
						</Button>
					</div>
				))}
				<div className="grid grid-cols-[1fr_auto] gap-2 bg-muted/10 p-2">
					<SetAdd act={act} />
				</div>
			</div>
		);
	if (value.kind === "zset")
		return (
			<div className="overflow-hidden border border-border">
				<div className="grid h-8 grid-cols-[1fr_8rem_5rem] items-center border-b border-border bg-muted/20 px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
					<span>Member</span>
					<span>Score</span>
					<span />
				</div>
				{value.entries.map((entry) => (
					<ZsetRow
						key={entry.member.base64}
						member={entry.member}
						score={entry.score}
						act={act}
					/>
				))}
				<AddPair
					score
					labels={["member", "score"]}
					onSave={(member, score) =>
						act({ action: "upsertZset", member, score: score as number })
					}
				/>
			</div>
		);
	if (value.kind === "stream")
		return (
			<div className="border border-border">
				<div className="grid h-8 grid-cols-[10rem_1fr_2rem] items-center border-b border-border bg-muted/20 px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
					<span>Entry ID</span>
					<span>Fields</span>
					<span />
				</div>
				{value.entries.map((entry) => (
					<div
						key={entry.id}
						className="grid grid-cols-[10rem_1fr_2rem] border-b border-border"
					>
						<code className="border-r border-border px-2 py-1.5 text-xs text-primary">
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
							onClick={() => act({ action: "deleteStream", id: entry.id })}
							aria-label={`Delete stream entry ${entry.id}`}
						>
							<Trash2 />
						</Button>
					</div>
				))}
				<AddPair
					labels={["field", "value"]}
					onSave={(field, next) =>
						act({
							action: "appendStream",
							id: "*",
							fields: [{ field, value: next as EncodedRedisValueSchemaType }],
						})
					}
				/>
			</div>
		);
	return (
		<Alert
			variant="info"
			title="Metadata only"
			message="This Redis module type cannot be edited in this release."
			className="rounded-sm"
		/>
	);
};

const StringEditor = ({
	value,
	truncated,
	act,
	onLoadFull,
	onDownload,
}: {
	value: EncodedRedisValueSchemaType;
	truncated: boolean;
	act: (operation: KeyActionSchemaType["operation"]) => Promise<unknown>;
	onLoadFull: () => void;
	onDownload: () => void;
}) => {
	const [draft, setDraft] = useState(value);
	useEffect(() => setDraft(value), [value]);
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
						size="sm"
						variant="outline"
						className="h-7"
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
			<div className="border border-border p-3">
				<Field className="gap-1.5">
					<FieldLabel htmlFor="redis-string-value">Replace value</FieldLabel>
					<RedisValueInput
						id="redis-string-value"
						value={draft}
						onChange={setDraft}
					/>
				</Field>
				<Button
					className="mt-3 h-7"
					size="sm"
					disabled={truncated}
					onClick={() => act({ action: "setString", value: draft })}
				>
					<Save /> Save value
				</Button>
			</div>
		</div>
	);
};

const HashRow = ({
	field,
	value,
	act,
}: {
	field: EncodedRedisValueSchemaType;
	value: EncodedRedisValueSchemaType;
	act: (operation: KeyActionSchemaType["operation"]) => Promise<unknown>;
}) => {
	const [draft, setDraft] = useState(value);
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
					onClick={() => act({ action: "upsertHash", field, value: draft })}
					aria-label="Save hash value"
				>
					<Save />
				</Button>
				<Button
					variant="ghost"
					size="icon-sm"
					className="text-muted-foreground hover:text-destructive"
					onClick={() => act({ action: "deleteHash", field })}
					aria-label="Delete hash field"
				>
					<Trash2 />
				</Button>
			</div>
		</div>
	);
};
const ListRow = ({
	index,
	value,
	act,
}: {
	index: number;
	value: EncodedRedisValueSchemaType;
	act: (operation: KeyActionSchemaType["operation"]) => Promise<unknown>;
}) => {
	const [draft, setDraft] = useState(value);
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
					onClick={() => act({ action: "setList", index, value: draft })}
					aria-label={`Save list item ${index}`}
				>
					<Save />
				</Button>
				<Button
					variant="ghost"
					size="icon-sm"
					className="text-muted-foreground hover:text-destructive"
					onClick={() => act({ action: "deleteList", index })}
					aria-label={`Delete list item ${index}`}
				>
					<Trash2 />
				</Button>
			</div>
		</div>
	);
};
const ListAdd = ({
	act,
}: {
	act: (operation: KeyActionSchemaType["operation"]) => Promise<unknown>;
}) => {
	const [value, setValue] = useState(emptyValue);
	return (
		<>
			<RedisValueInput
				value={value}
				onChange={setValue}
				placeholder="new item"
			/>
			<Button
				size="sm"
				variant="outline"
				onClick={() => act({ action: "pushList", side: "left", value })}
			>
				Push left
			</Button>
			<Button
				size="sm"
				onClick={() => act({ action: "pushList", side: "right", value })}
			>
				Push right
			</Button>
		</>
	);
};
const SetAdd = ({
	act,
}: {
	act: (operation: KeyActionSchemaType["operation"]) => Promise<unknown>;
}) => {
	const [member, setMember] = useState(emptyValue);
	return (
		<>
			<RedisValueInput
				value={member}
				onChange={setMember}
				placeholder="new member"
			/>
			<Button
				size="sm"
				onClick={() => act({ action: "addSet", member })}
			>
				Add member
			</Button>
		</>
	);
};
const ZsetRow = ({
	member,
	score,
	act,
}: {
	member: EncodedRedisValueSchemaType;
	score: number;
	act: (operation: KeyActionSchemaType["operation"]) => Promise<unknown>;
}) => {
	const [draft, setDraft] = useState(String(score));
	return (
		<div className="grid min-h-8 grid-cols-[1fr_8rem_5rem] items-center gap-2 border-b border-border px-2 py-1">
			<RedisValue
				value={member}
				compact
			/>
			<Input
				type="number"
				value={draft}
				onChange={(event) => setDraft(event.target.value)}
				className="font-mono"
			/>
			<div className="flex">
				<Button
					variant="ghost"
					size="icon-sm"
					onClick={() => act({ action: "upsertZset", member, score: Number(draft) })}
					aria-label="Save sorted set score"
				>
					<Save />
				</Button>
				<Button
					variant="ghost"
					size="icon-sm"
					className="text-muted-foreground hover:text-destructive"
					onClick={() => act({ action: "removeZset", member })}
					aria-label="Remove sorted set member"
				>
					<Trash2 />
				</Button>
			</div>
		</div>
	);
};

export const RedisBrowserScreen = () => {
	const navigate = useNavigate();
	const { selectedDatabase } = useDatabaseStore();
	const { openOverlay } = useOverlayStore();
	const [selectedKey, setSelectedKey] = useQueryState("key");
	const [fullKey, setFullKey] = useState<string | null>(null);
	const [reverseStreamKey, setReverseStreamKey] = useState<string | null>(null);
	const streamDirection = reverseStreamKey === selectedKey ? "backward" : "forward";
	const query = useRedisKey(selectedKey, fullKey === selectedKey, streamDirection);
	const { applyAction, deleteKey, isPending } = useRedisKeyMutations();
	const pages = query.data?.pages;
	const detail = pages?.[0];
	const [rename, setRename] = useState("");
	const [ttl, setTtl] = useState("");
	const [conflictOperation, setConflictOperation] = useState<
		KeyActionSchemaType["operation"] | null
	>(null);
	const label = detail?.key.utf8 ?? (detail ? `binary:${detail.key.base64}` : "");
	const command = detail ? runnerCommand(detail) : null;
	useEffect(() => setRename(detail?.key.utf8 ?? ""), [detail?.key.base64, detail?.key.utf8]);

	const mergedDetail = useMemo(() => {
		if (!detail || !pages || pages.length === 1) return detail;
		const next = structuredClone(detail);
		for (const page of pages.slice(1)) {
			if (next.value.kind === "hash" && page.value.kind === "hash")
				next.value.entries.push(...page.value.entries);
			if (next.value.kind === "list" && page.value.kind === "list")
				next.value.entries.push(...page.value.entries);
			if (next.value.kind === "set" && page.value.kind === "set")
				next.value.members.push(...page.value.members);
			if (next.value.kind === "zset" && page.value.kind === "zset")
				next.value.entries.push(...page.value.entries);
			if (next.value.kind === "stream" && page.value.kind === "stream")
				next.value.entries.push(...page.value.entries);
		}
		return next;
	}, [detail, pages]);

	const act = async (operation: KeyActionSchemaType["operation"], force = false) => {
		if (!selectedKey || !detail) return;
		try {
			const result = await applyAction(selectedKey, {
				expectedRevision: detail.revision,
				force,
				operation,
			});
			setConflictOperation(null);
			if (result.deleted) setSelectedKey(null);
			else if ((result.key.base64 || "-") !== selectedKey)
				setSelectedKey(result.key.base64 || "-");
		} catch (error) {
			if ((error as Error & { status?: number }).status === 409)
				setConflictOperation(operation);
			throw error;
		}
	};

	const downloadOriginalString = async () => {
		if (!selectedKey || !detail || detail.type !== "string") return;
		const chunks: Uint8Array[] = [];
		let offset = 0;
		let hasMore = true;
		while (hasMore) {
			const response = await getRedisStringChunk({
				db: selectedDatabase ?? "",
				key: selectedKey,
				offset,
				expectedRevision: detail.revision,
			});
			const page = response.data.data;
			chunks.push(bytesFromBase64Url(page.chunk.base64));
			hasMore = page.hasMore;
			if (page.hasMore && (page.nextOffset === null || page.nextOffset <= offset)) {
				throw new Error("Redis download made no forward progress");
			}
			offset = page.nextOffset ?? offset;
		}
		const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
		const bytes = new Uint8Array(size);
		let position = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, position);
			position += chunk.length;
		}
		const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer]));
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `${detail.key.utf8?.replaceAll(/[^\w.-]+/g, "_") || "redis-value"}.bin`;
		anchor.click();
		URL.revokeObjectURL(url);
	};

	if (!selectedKey)
		return (
			<main className="flex flex-1 items-center justify-center bg-background font-mono">
				<div className="max-w-sm text-center">
					<DatabaseZap className="mx-auto mb-3 size-5 text-muted-foreground" />
					<h1 className="text-sm font-medium text-foreground">No key selected</h1>
					<p className="mt-1 text-xs leading-5 text-muted-foreground">
						Select a key from the navigator or create one to inspect its value.
					</p>
					<Button
						variant="outline"
						size="sm"
						className="mt-3 h-7"
						onClick={() => openOverlay("redis-browser.create-key")}
					>
						<Plus /> Create key
					</Button>
				</div>
			</main>
		);
	if (query.isLoading)
		return (
			<main className="flex flex-1 items-center justify-center">
				<Spinner />
			</main>
		);
	if (query.error || !detail || !mergedDetail)
		return (
			<main className="flex flex-1 items-center justify-center bg-background p-4">
				<div className="w-full max-w-md text-center">
					<Alert
						variant="error"
						title="Unable to load key"
						message={query.error?.message ?? "The key no longer exists."}
						className="rounded-sm text-left"
					/>
					<Button
						variant="outline"
						size="sm"
						className="mt-4"
						onClick={() => setSelectedKey(null)}
					>
						Back to keyspace
					</Button>
				</div>
			</main>
		);

	return (
		<main className="flex min-h-0 flex-1 flex-col bg-background font-mono">
			<header className="border-b border-border">
				<div className="flex h-8 items-center justify-between gap-2 border-b border-border px-2">
					<div className="flex min-w-0 items-center gap-2">
						<Badge
							variant="outline"
							className="h-4 rounded-sm px-1.5 text-[8px] font-normal uppercase text-muted-foreground"
						>
							{detail.type}
						</Badge>
						<span className="text-[10px] uppercase tracking-wider text-muted-foreground">
							Redis key
						</span>
					</div>
					<div className="flex h-full items-center">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 rounded-none"
							disabled={!command}
							onClick={() => command && navigate({ to: "/runner", search: { cmd: command } })}
							title={
								command
									? "Open this key in the Redis runner"
									: "Binary keys cannot be represented safely in redis-cli syntax"
							}
						>
							<Terminal /> Runner
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="h-7 rounded-none"
							onClick={() => query.refetch()}
							disabled={query.isFetching}
						>
							<RefreshCw className={cn(query.isFetching && "animate-spin")} /> Refresh
						</Button>
						<Button
							variant="destructive"
							size="sm"
							className="h-7 rounded-sm"
							disabled={isPending}
							onClick={async () => {
								if (window.confirm(`Delete ${label}? This cannot be undone.`)) {
									await deleteKey(selectedKey, detail.revision);
									setSelectedKey(null);
								}
							}}
						>
							<Trash2 /> Delete
						</Button>
					</div>
				</div>
				<div className="flex min-h-10 items-stretch overflow-x-auto whitespace-nowrap">
					<div className="flex min-w-0 flex-1 items-center gap-1 px-3 text-xs">
						<span className="text-muted-foreground">db{selectedDatabase}</span>
						<span className="text-muted-foreground">/</span>
						<span className="text-muted-foreground">key</span>
						<span className="text-muted-foreground">/</span>
						<code
							className="min-w-0 truncate text-foreground"
							title={label}
						>
							{label || "(empty key)"}
						</code>
					</div>
					{[
						["TTL", formatTtl(detail.ttlMs)],
						["MEM", formatBytes(detail.memoryBytes)],
						["LEN", detail.length ?? "—"],
						["REV", detail.revision.slice(0, 8)],
						["SYNC", new Date(query.dataUpdatedAt).toLocaleTimeString()],
					].map(([name, value]) => (
						<div
							key={name}
							className="flex shrink-0 items-center gap-1.5 border-l border-border px-2 text-[10px]"
						>
							<span className="text-muted-foreground">{name}</span>
							<span className="text-foreground">{value}</span>
						</div>
					))}
				</div>
			</header>
			{conflictOperation && (
				<div className="grid gap-2 border-b border-border p-2 sm:grid-cols-[1fr_auto] sm:items-center">
					<Alert
						variant="warning"
						title="Revision conflict"
						message="This key changed on the server. Reload it or overwrite with the pending change."
						className="rounded-sm py-2"
					/>
					<div className="flex gap-2">
						<Button
							size="sm"
							variant="outline"
							className="h-7"
							onClick={() => {
								setConflictOperation(null);
								query.refetch();
							}}
						>
							Reload
						</Button>
						<Button
							size="sm"
							className="h-7"
							onClick={() => act(conflictOperation, true)}
						>
							Overwrite
						</Button>
					</div>
				</div>
			)}
			<div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_15rem]">
				<section className="overflow-auto p-3">
					{detail.type === "stream" && (
						<div className="mb-2 flex h-8 items-center justify-between border border-border bg-muted/10 px-2">
							<span className="text-[10px] uppercase tracking-wider text-muted-foreground">
								Stream order
							</span>
							<ToggleGroup
								type="single"
								variant="ghost"
								size="sm"
								value={streamDirection}
								className="rounded-none"
							>
								<ToggleGroupItem
									value="forward"
									className="h-6 rounded-none px-2 text-[10px]"
									onClick={() => setReverseStreamKey(null)}
								>
									Oldest first
								</ToggleGroupItem>
								<ToggleGroupItem
									value="backward"
									className="h-6 rounded-none px-2 text-[10px]"
									onClick={() => setReverseStreamKey(selectedKey)}
								>
									Newest first
								</ToggleGroupItem>
							</ToggleGroup>
						</div>
					)}
					<ValueEditor
						detail={mergedDetail}
						act={act}
						onLoadFull={() => setFullKey(selectedKey)}
						onDownload={() => {
							toast.promise(downloadOriginalString(), {
								loading: "Downloading original Redis bytes…",
								success: "Redis value downloaded",
								error: (error: Error) => error.message || "Download failed",
							});
						}}
					/>
					{query.hasNextPage && (
						<Button
							variant="outline"
							className="mt-3 h-7 w-full"
							onClick={() => query.fetchNextPage()}
							disabled={query.isFetchingNextPage}
						>
							{query.isFetchingNextPage
								? "Loading…"
								: detail.type === "stream" && streamDirection === "backward"
									? "Load 100 older entries"
									: "Load next 100"}
						</Button>
					)}
				</section>
				<aside className="border-l border-border bg-muted/10 p-3">
					<h2 className="mb-3 text-[10px] uppercase tracking-wider text-muted-foreground">
						Key operations
					</h2>
					<FieldGroup className="gap-4">
						<Field className="gap-1.5">
							<FieldLabel htmlFor="redis-key-rename">Rename key</FieldLabel>
							<div className="flex">
								<Input
									id="redis-key-rename"
									value={rename}
									onChange={(event) => setRename(event.target.value)}
									className="rounded-r-none font-mono"
								/>
								<Button
									size="icon-sm"
									className="rounded-l-none"
									disabled={rename === detail.key.utf8}
									onClick={() => act({ action: "rename", newKey: encodeTextValue(rename) })}
								>
									<ArrowRight />
								</Button>
							</div>
						</Field>
						<Field className="gap-1.5">
							<FieldLabel htmlFor="redis-key-ttl-operation">TTL in seconds</FieldLabel>
							<div className="flex">
								<Input
									id="redis-key-ttl-operation"
									type="number"
									min={1}
									value={ttl}
									onChange={(event) => setTtl(event.target.value)}
									placeholder={
										detail.ttlMs > 0 ? String(Math.ceil(detail.ttlMs / 1_000)) : "Persistent"
									}
									className="rounded-r-none font-mono"
								/>
								<Button
									size="sm"
									className="rounded-l-none"
									onClick={() =>
										act({ action: "setTtl", ttlMs: ttl ? Number(ttl) * 1_000 : null })
									}
								>
									Apply
								</Button>
							</div>
							<FieldDescription>Leave empty to persist the key.</FieldDescription>
						</Field>
						<p className="border-t border-border pt-3 text-[10px] leading-5 text-muted-foreground">
							Changes are immediate and guarded by revision {detail.revision.slice(0, 8)}.
						</p>
					</FieldGroup>
				</aside>
			</div>
		</main>
	);
};
