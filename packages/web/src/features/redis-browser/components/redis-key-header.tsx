import type { KeyDetailsResultSchemaType } from "@db-studio/shared/types";
import { Badge } from "@db-studio/ui/badge";
import { Button } from "@db-studio/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@db-studio/ui/field";
import { Input } from "@db-studio/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@db-studio/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@db-studio/ui/tooltip";
import { cn } from "@db-studio/ui/utils";
import { ArrowRight, Pencil, RefreshCw, Terminal, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useReducer, useState } from "react";
import { RedisCopyButton } from "./redis-copy-button";
import { encodeTextValue } from "./redis-value";
import type { RedisAct } from "./redis-value-editors";

const TTL_PRESETS = [
	{ label: "60s", ttlMs: 60_000 },
	{ label: "10m", ttlMs: 600_000 },
	{ label: "1h", ttlMs: 3_600_000 },
	{ label: "1d", ttlMs: 86_400_000 },
	{ label: "7d", ttlMs: 604_800_000 },
] as const;

const formatBytes = (bytes: number | null): string => {
	if (bytes === null) return "—";
	if (bytes < 1_024) return `${bytes} B`;
	if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KiB`;
	return `${(bytes / 1_048_576).toFixed(1)} MiB`;
};

const formatDuration = (ms: number): string => {
	const seconds = Math.max(0, Math.ceil(ms / 1_000));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ${minutes % 60}m`;
	return `${Math.floor(hours / 24)}d ${hours % 24}h`;
};

/** Re-renders once a second while `active`, so TTLs count down live. */
const useSecondTick = (active: boolean) => {
	const [, tick] = useReducer((count: number) => count + 1, 0);
	useEffect(() => {
		if (!active) return;
		const id = window.setInterval(tick, 1_000);
		return () => window.clearInterval(id);
	}, [active]);
};

/**
 * Key toolbar: name + copy, type badge, live stats, refresh, open-in-runner,
 * rename/TTL popover, and delete. Mount with `key={detail.key.base64}` so the
 * rename/TTL drafts reset when the selected key changes.
 */
export const RedisKeyHeader = ({
	detail,
	label,
	loadedCount,
	fetchedAt,
	isFetching,
	pending,
	command,
	act,
	onRefresh,
	onOpenRunner,
	onDelete,
}: {
	detail: KeyDetailsResultSchemaType;
	label: string;
	loadedCount: number | null;
	fetchedAt: number;
	isFetching: boolean;
	pending: boolean;
	command: string | null;
	act: RedisAct;
	onRefresh: () => void;
	onOpenRunner: () => void;
	onDelete: () => void;
}) => {
	const [rename, setRename] = useState(detail.key.utf8 ?? "");
	const [ttl, setTtl] = useState("");
	useSecondTick(detail.ttlMs > 0);

	const remainingMs =
		detail.ttlMs > 0 ? detail.ttlMs - (Date.now() - fetchedAt) : detail.ttlMs;
	const persistent = detail.ttlMs === -1;
	const expired = !persistent && remainingMs <= 0;
	const stats: { name: string; value: ReactNode; hint: string; alert?: boolean }[] = [
		{
			name: "TTL",
			value: persistent ? "∞" : expired ? "expired" : formatDuration(remainingMs),
			hint: persistent
				? "No expiry — the key persists until deleted."
				: expired
					? "The TTL elapsed; Redis has evicted or is about to evict this key."
					: `Expires ${new Date(fetchedAt + detail.ttlMs).toLocaleString()}`,
			alert: expired,
		},
		{
			name: "MEM",
			value: formatBytes(detail.memoryBytes),
			hint: "Approximate memory usage reported by MEMORY USAGE.",
		},
		{
			name: "LEN",
			value: detail.length?.toLocaleString() ?? "—",
			hint:
				loadedCount !== null && detail.length !== null
					? `${loadedCount.toLocaleString()} of ${detail.length.toLocaleString()} entries loaded in this view.`
					: "Length reported by Redis (entries, or bytes for strings).",
		},
		{
			name: "REV",
			value: detail.revision.slice(0, 8),
			hint: "Optimistic-lock revision. Writes are rejected when the key changed since this fetch.",
		},
		{
			name: "AT",
			value: new Date(fetchedAt).toLocaleTimeString(),
			hint: "When this snapshot was fetched from Redis.",
		},
	];

	return (
		<header className="border-b border-border">
			<div className="flex min-h-10 items-stretch justify-between">
				<div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
					<div className="flex min-w-0 max-w-[min(36rem,45vw)] shrink items-center gap-1 px-3 py-1.5">
						<code
							className="min-w-0 truncate text-sm text-foreground"
							title={label}
						>
							{label || "(empty key)"}
						</code>
						<RedisCopyButton
							text={detail.key.utf8 ?? detail.key.base64}
							label="Copy key name"
							className="shrink-0 text-muted-foreground"
						/>
						<Badge
							variant="outline"
							className="h-4 shrink-0 rounded-sm px-1.5 text-[8px] font-normal uppercase text-muted-foreground"
						>
							{detail.type}
						</Badge>
					</div>
					{stats.map(({ name, value, hint, alert }, index) => (
						<Tooltip key={name}>
							<TooltipTrigger asChild>
								<div
									className={cn(
										"flex shrink-0 cursor-default items-center gap-1.5 border-s border-border px-2 text-[10px]",
										index === stats.length - 1 && "border-e",
									)}
								>
									<span className="text-muted-foreground">{name}</span>
									<span
										className={cn(
											"tabular-nums",
											alert ? "text-destructive" : "text-foreground",
										)}
									>
										{value}
									</span>
								</div>
							</TooltipTrigger>
							<TooltipContent side="bottom">{hint}</TooltipContent>
						</Tooltip>
					))}
				</div>
				<div className="flex shrink-0 items-stretch">
					<Button
						variant="ghost"
						size="sm"
						className="h-auto rounded-none border-y-0 border-s border-e-0 border-border px-2"
						onClick={onRefresh}
						disabled={isFetching}
					>
						<RefreshCw className={cn(isFetching && "animate-spin")} /> Refresh
					</Button>
					{command && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="sm"
									className="h-auto rounded-none border-y-0 border-s border-e-0 border-border px-2"
									onClick={onOpenRunner}
								>
									<Terminal /> Runner
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								Open in the query runner as <code className="font-mono">{command}</code>
							</TooltipContent>
						</Tooltip>
					)}
					<Popover>
						<PopoverTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="h-auto rounded-none border-y-0 border-s border-e-0 border-border px-2"
							>
								<Pencil /> Edit
							</Button>
						</PopoverTrigger>
						<PopoverContent
							align="end"
							className="w-72 rounded-sm p-3 font-mono"
						>
							<FieldGroup className="gap-4">
								<Field className="gap-1.5">
									<FieldLabel htmlFor="redis-key-rename">Rename key</FieldLabel>
									<form
										className="flex"
										onSubmit={(event) => {
											event.preventDefault();
											if (rename === detail.key.utf8 || pending) return;
											act({ action: "rename", newKey: encodeTextValue(rename) });
										}}
									>
										<Input
											id="redis-key-rename"
											value={rename}
											onChange={(event) => setRename(event.target.value)}
											className="rounded-e-none font-mono"
										/>
										<Button
											type="submit"
											size="icon"
											className="h-auto self-stretch rounded-s-none border-0 bg-clip-border"
											disabled={rename === detail.key.utf8 || pending}
											aria-label="Rename key"
										>
											<ArrowRight />
										</Button>
									</form>
								</Field>
								<Field className="gap-1.5">
									<FieldLabel htmlFor="redis-key-ttl-operation">TTL in seconds</FieldLabel>
									<form
										className="flex"
										onSubmit={(event) => {
											event.preventDefault();
											if (pending) return;
											act({ action: "setTtl", ttlMs: ttl ? Number(ttl) * 1_000 : null });
										}}
									>
										<Input
											id="redis-key-ttl-operation"
											type="number"
											min={1}
											value={ttl}
											onChange={(event) => setTtl(event.target.value)}
											placeholder={
												detail.ttlMs > 0
													? String(Math.ceil(detail.ttlMs / 1_000))
													: "Persistent"
											}
											className="rounded-e-none font-mono"
										/>
										<Button
											type="submit"
											className="h-auto self-stretch rounded-s-none border-0 bg-clip-border"
											disabled={pending}
										>
											Apply
										</Button>
									</form>
									<div className="flex flex-wrap gap-1">
										{TTL_PRESETS.map((preset) => (
											<Button
												key={preset.label}
												type="button"
												variant="outline"
												size="xs"
												disabled={pending}
												onClick={() => act({ action: "setTtl", ttlMs: preset.ttlMs })}
											>
												{preset.label}
											</Button>
										))}
										<Button
											type="button"
											variant="outline"
											size="xs"
											disabled={pending || persistent}
											onClick={() => act({ action: "setTtl", ttlMs: null })}
										>
											Persist
										</Button>
									</div>
									<FieldDescription>Leave empty to persist the key.</FieldDescription>
								</Field>
							</FieldGroup>
						</PopoverContent>
					</Popover>
					<Button
						variant="destructive"
						size="sm"
						className="h-auto rounded-none border-y-0 border-s border-e-0 border-border px-2"
						disabled={pending}
						onClick={onDelete}
					>
						<Trash2 /> Delete
					</Button>
				</div>
			</div>
		</header>
	);
};
