import { Badge } from "@db-studio/ui/badge";
import { Button } from "@db-studio/ui/button";
import { Input } from "@db-studio/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@db-studio/ui/select";
import { Toggle } from "@db-studio/ui/toggle";
import { cn } from "@db-studio/ui/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
	Braces,
	Infinity as InfinityIcon,
	KeyRound,
	Plus,
	RefreshCw,
	Search,
} from "lucide-react";
import { useQueryState } from "nuqs";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useOverlayStore } from "@/stores/overlay.store";
import { useRedisKeys } from "../hooks/use-redis-browser";
import { RedisCreateKeySheet } from "./redis-create-key-sheet";
import { bytesFromBase64Url } from "./redis-value";

const KEY_TYPES = ["string", "hash", "list", "set", "zset", "stream"] as const;
const TYPE_LABELS: Record<string, string> = {
	string: "STR",
	hash: "HASH",
	list: "LIST",
	set: "SET",
	zset: "ZSET",
	stream: "XSTR",
};

const formatTtl = (ttlMs: number): string => {
	if (ttlMs === -1) return "∞";
	if (ttlMs < 0) return "gone";
	if (ttlMs < 1_000) return `${ttlMs}ms`;
	if (ttlMs < 60_000) return `${Math.ceil(ttlMs / 1_000)}s`;
	if (ttlMs < 3_600_000) return `${Math.ceil(ttlMs / 60_000)}m`;
	return `${Math.ceil(ttlMs / 3_600_000)}h`;
};

const formatMemory = (bytes: number | null): string => {
	if (bytes === null) return "—";
	if (bytes < 1_024) return `${bytes} B`;
	return `${(bytes / 1_024).toFixed(1)} KiB`;
};

const formatKey = (base64: string, utf8?: string): string => {
	if (utf8 !== undefined) return utf8 || "(empty key)";
	return `0x${Array.from(bytesFromBase64Url(base64), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("")}`;
};

export const RedisKeySidebar = () => {
	const { openOverlay } = useOverlayStore();
	const [selectedKey, setSelectedKey] = useQueryState("key");
	const [search, setSearch] = useQueryState("search", { defaultValue: "" });
	const [debouncedSearch, setDebouncedSearch] = useState(search);
	const [type, setType] = useQueryState("type", { defaultValue: "" });
	const [exact, setExact] = useQueryState("glob", { defaultValue: "false" });
	const exactPattern = exact === "true";
	const query = useRedisKeys({ search: debouncedSearch, type, exactPattern });
	const keys = useMemo(
		() => query.data?.pages.flatMap((page) => page.keys) ?? [],
		[query.data],
	);
	const parentRef = useRef<HTMLDivElement>(null);
	const virtualizer = useVirtualizer({
		count: keys.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 33,
		overscan: 10,
	});
	const items = virtualizer.getVirtualItems();

	useEffect(() => {
		const timeout = window.setTimeout(() => setDebouncedSearch(search), 250);
		return () => window.clearTimeout(timeout);
	}, [search]);

	useEffect(() => {
		const last = items.at(-1);
		if (
			last &&
			last.index >= keys.length - 5 &&
			query.hasNextPage &&
			!query.isFetchingNextPage
		)
			query.fetchNextPage();
	}, [items, keys.length, query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);

	return (
		<div className="flex min-h-0 flex-1 flex-col bg-background font-mono">
			<div>
				<div className="space-y-2 px-3 pb-3 pt-2">
					<div className="flex items-center gap-2">
						<div className="relative min-w-0 flex-1">
							<Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
							<Input
								variant="outline"
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								placeholder={exactPattern ? "Redis glob pattern" : "Find keys"}
								aria-label="Find Redis keys"
								className="h-8 rounded-sm pl-8"
							/>
						</div>
						<Button
							variant="outline"
							size="icon-lg"
							className="shrink-0 rounded-sm"
							onClick={() =>
								toast.promise(query.refetch({ throwOnError: true }), {
									loading: "Refreshing Redis keys...",
									success: "Redis keys refreshed",
									error: "Failed to refresh Redis keys",
								})
							}
							disabled={query.isFetching}
							aria-label="Refresh Redis keys"
						>
							<RefreshCw className={cn(query.isFetching && "animate-spin")} />
						</Button>
						<Button
							size="icon-lg"
							className="shrink-0 rounded-sm"
							onClick={() => openOverlay("redis-browser.create-key")}
							aria-label="Create Redis key"
						>
							<Plus />
						</Button>
					</div>

					<div className="flex items-center gap-2">
						<Select
							value={type || "all"}
							onValueChange={(value) => setType(value === "all" ? "" : value)}
						>
							<SelectTrigger
								variant="outline"
								aria-label="Filter Redis key type"
								className="h-8! min-w-0 flex-1 justify-between rounded-sm"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All types</SelectItem>
								{KEY_TYPES.map((item) => (
									<SelectItem
										key={item}
										value={item}
									>
										{item}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Toggle
							variant="outline"
							size="lg"
							pressed={exactPattern}
							onPressedChange={(pressed) => setExact(pressed ? "true" : "false")}
							className="shrink-0 rounded-sm px-2 text-xs/relaxed uppercase"
							aria-label="Use Redis glob pattern"
						>
							<Braces className="size-4" /> Glob
						</Toggle>
					</div>
				</div>

				<div className="flex h-6 items-center justify-between px-4 text-[9px] uppercase tracking-wider text-muted-foreground">
					<span>{keys.length} loaded</span>
					<span>
						{query.dataUpdatedAt > 0
							? new Date(query.dataUpdatedAt).toLocaleTimeString()
							: "not scanned"}
					</span>
				</div>
			</div>

			<div
				ref={parentRef}
				className="min-h-0 flex-1 overflow-auto"
			>
				{query.isLoading ? (
					<div className="px-3 py-4 text-xs text-muted-foreground">Scanning keyspace…</div>
				) : keys.length === 0 ? (
					<div className="flex min-h-32 flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground">
						<KeyRound className="size-4" />
						<span className="text-xs">No keys in this scan.</span>
						<Button
							variant="outline"
							size="sm"
							onClick={() => openOverlay("redis-browser.create-key")}
						>
							<Plus /> Create key
						</Button>
					</div>
				) : (
					<div
						className="relative w-full"
						style={{ height: `${virtualizer.getTotalSize()}px` }}
					>
						{items.map((item) => {
							const key = keys[item.index];
							const keyParam = key.key.base64 || "-";
							const label = formatKey(key.key.base64, key.key.utf8);
							return (
								<Button
									key={`${keyParam}-${item.index}`}
									variant="ghost"
									onClick={() => setSelectedKey(keyParam)}
									className={cn(
										"absolute left-0 top-0 h-auto w-full justify-start gap-2 rounded-none px-4 py-1.5 text-sm font-normal transition-colors",
										selectedKey === keyParam
											? "bg-sidebar-accent text-sidebar-accent-foreground font-medium before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary"
											: "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
									)}
									style={{ transform: `translateY(${item.start}px)` }}
									title={label}
								>
									<span className="min-w-0 flex-1 truncate text-left text-current">
										{label}
									</span>
									<Badge
										variant="outline"
										className="h-4 w-10 shrink-0 justify-center rounded-sm px-1 text-[8px] font-normal text-muted-foreground"
									>
										{TYPE_LABELS[key.type] ?? "?"}
									</Badge>
									<span className="shrink-0 text-[9px] text-muted-foreground">
										{formatMemory(key.memoryBytes)} ·{" "}
										{key.ttlMs === -1 ? (
											<InfinityIcon
												className="inline size-3 align-[-2px]"
												aria-label="No expiry"
											/>
										) : (
											formatTtl(key.ttlMs)
										)}
									</span>
								</Button>
							);
						})}
					</div>
				)}
				{query.isFetchingNextPage && (
					<div className="px-2 py-1 text-center text-[10px] text-muted-foreground">
						Scanning more…
					</div>
				)}
			</div>
			<RedisCreateKeySheet />
		</div>
	);
};
