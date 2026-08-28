import type { KeyActionSchemaType, KeyDetailsResultSchemaType } from "@db-studio/shared/types";
import { Alert } from "@db-studio/ui/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@db-studio/ui/alert-dialog";
import { Button } from "@db-studio/ui/button";
import { Spinner } from "@db-studio/ui/spinner";
import { useNavigate } from "@tanstack/react-router";
import { DatabaseZap, Plus } from "lucide-react";
import { useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { getRedisStringChunk } from "@/shared/api";
import { useDatabaseStore } from "@/stores/database.store";
import { useOverlayStore } from "@/stores/overlay.store";
import { useQueriesStore } from "@/stores/queries.store";
import { RedisKeyHeader } from "../components/redis-key-header";
import { bytesFromBase64Url } from "../components/redis-value";
import {
	type RedisAct,
	RedisValueEditor,
	type StreamDirection,
} from "../components/redis-value-editors";
import { useRedisKey, useRedisKeyMutations } from "../hooks/use-redis-browser";

/** The read command a dev would run for this key, used by "Open in runner". */
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

/** Entries fetched so far across pages; null for scalar/unknown values. */
const countLoaded = (detail: KeyDetailsResultSchemaType): number | null => {
	switch (detail.value.kind) {
		case "hash":
		case "list":
		case "zset":
		case "stream":
			return detail.value.entries.length;
		case "set":
			return detail.value.members.length;
		default:
			return null;
	}
};

export const RedisBrowserScreen = () => {
	const navigate = useNavigate();
	const { selectedDatabase } = useDatabaseStore();
	const { openOverlay } = useOverlayStore();
	const { addQuery, updateQuery } = useQueriesStore();
	const [selectedKey, setSelectedKey] = useQueryState("key");
	const [fullKey, setFullKey] = useState<string | null>(null);
	const [reverseStreamKey, setReverseStreamKey] = useState<string | null>(null);
	const streamDirection: StreamDirection =
		reverseStreamKey === selectedKey ? "backward" : "forward";
	const query = useRedisKey(selectedKey, fullKey === selectedKey, streamDirection);
	const { applyAction, deleteKey, isPending } = useRedisKeyMutations();
	const pages = query.data?.pages;
	const detail = pages?.[0];
	const [confirmingDelete, setConfirmingDelete] = useState(false);
	const [conflictOperation, setConflictOperation] = useState<
		KeyActionSchemaType["operation"] | null
	>(null);
	const label = detail?.key.utf8 ?? (detail ? `binary:${detail.key.base64}` : "");
	const command = detail ? runnerCommand(detail) : null;

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
	const loadedCount = mergedDetail ? countLoaded(mergedDetail) : null;

	const act: RedisAct = async (operation, force = false) => {
		if (!selectedKey || !detail) return false;
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
			return true;
		} catch (error) {
			// toast.promise in the mutation hook already surfaced the failure.
			if ((error as Error & { status?: number }).status === 409)
				setConflictOperation(operation);
			return false;
		}
	};

	const openInRunner = () => {
		if (!command) return;
		const queryId = addQuery(`redis: ${label.slice(0, 40)}`);
		updateQuery(queryId, { query: command });
		navigate({ to: "/runner/$queryId", params: { queryId } });
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
						className="mt-3"
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
						className="rounded-sm text-start"
					/>
					<Button
						variant="outline"
						className="mt-4"
						onClick={() => setSelectedKey(null)}
					>
						Back to keyspace
					</Button>
				</div>
			</main>
		);

	const remaining =
		mergedDetail.length !== null && loadedCount !== null
			? Math.max(0, mergedDetail.length - loadedCount)
			: null;

	return (
		<main className="flex min-h-0 flex-1 flex-col bg-background font-mono">
			<RedisKeyHeader
				key={detail.key.base64}
				detail={detail}
				label={label}
				loadedCount={loadedCount}
				fetchedAt={query.dataUpdatedAt}
				isFetching={query.isFetching}
				pending={isPending}
				command={command}
				act={act}
				onRefresh={() => query.refetch()}
				onOpenRunner={openInRunner}
				onDelete={() => setConfirmingDelete(true)}
			/>
			<AlertDialog
				open={confirmingDelete}
				onOpenChange={setConfirmingDelete}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete key</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete{" "}
							<code className="break-all text-foreground">{label || "(empty key)"}</code>? This
							action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={async () => {
								setConfirmingDelete(false);
								try {
									await deleteKey(selectedKey, detail.revision);
									setSelectedKey(null);
								} catch {
									// toast.promise in the mutation hook already surfaced the failure.
								}
							}}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
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
							variant="outline"
							onClick={() => {
								setConflictOperation(null);
								query.refetch();
							}}
						>
							Reload
						</Button>
						<Button
							disabled={isPending}
							onClick={() => act(conflictOperation, true)}
						>
							Overwrite
						</Button>
					</div>
				</div>
			)}
			<div className="min-h-0 flex-1 overflow-auto">
				<section className="p-3">
					<RedisValueEditor
						key={detail.key.base64}
						detail={mergedDetail}
						act={act}
						pending={isPending}
						onLoadFull={() => setFullKey(selectedKey)}
						onDownload={() => {
							toast.promise(downloadOriginalString(), {
								loading: "Downloading original Redis bytes…",
								success: "Redis value downloaded",
								error: (error: Error) => error.message || "Download failed",
							});
						}}
						streamDirection={streamDirection}
						onStreamDirectionChange={(direction) =>
							setReverseStreamKey(direction === "backward" ? selectedKey : null)
						}
					/>
					{query.hasNextPage && (
						<Button
							variant="outline"
							className="mt-3 w-full"
							onClick={() => query.fetchNextPage()}
							disabled={query.isFetchingNextPage}
						>
							{query.isFetchingNextPage
								? "Loading…"
								: detail.type === "stream" && streamDirection === "backward"
									? "Load 100 older entries"
									: `Load next 100${remaining !== null ? ` (${remaining.toLocaleString()} remaining)` : ""}`}
						</Button>
					)}
				</section>
			</div>
		</main>
	);
};
