import type {
	CreateKeySchemaType,
	KeyActionSchemaType,
	RedisKeyTypeSchemaType,
} from "@db-studio/shared/types";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	applyRedisKeyAction,
	createRedisKey,
	deleteRedisKey,
	getRedisKey,
	scanRedisKeys,
} from "@/shared/api";
import { redisKeyBrowserKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";

export const useRedisKeys = ({
	search,
	exactPattern,
	type,
}: {
	search: string;
	exactPattern: boolean;
	type: string;
}) => {
	const { selectedDatabase } = useDatabaseStore();
	return useInfiniteQuery({
		queryKey: redisKeyBrowserKeys.list(selectedDatabase, search, exactPattern, type),
		queryFn: async ({ pageParam }) => {
			const response = await scanRedisKeys({
				db: selectedDatabase ?? "",
				cursor: pageParam || undefined,
				limit: 100,
				search: search || undefined,
				exactPattern,
				type: (type || undefined) as Exclude<RedisKeyTypeSchemaType, "unknown"> | undefined,
			});
			return response.data.data;
		},
		initialPageParam: "",
		getNextPageParam: (page) => page.nextCursor ?? undefined,
		enabled: selectedDatabase !== null,
		staleTime: Number.POSITIVE_INFINITY,
	});
};

export const useRedisKey = (
	key: string | null,
	full = false,
	direction: "forward" | "backward" = "forward",
) => {
	const { selectedDatabase } = useDatabaseStore();
	return useInfiniteQuery({
		queryKey: redisKeyBrowserKeys.detail(selectedDatabase, key, full, direction),
		queryFn: async ({ pageParam }) => {
			const response = await getRedisKey({
				db: selectedDatabase ?? "",
				key: key ?? "",
				cursor: pageParam || undefined,
				full,
				direction,
			});
			return response.data.data;
		},
		initialPageParam: "",
		getNextPageParam: (page) => page.nextCursor ?? undefined,
		enabled: selectedDatabase !== null && key !== null,
		staleTime: Number.POSITIVE_INFINITY,
		retry: false,
	});
};

const mutationError = (error: Error & { details?: unknown }): string =>
	(typeof error.details === "string" && error.details) ||
	error.message ||
	"Redis operation failed";

export const useRedisKeyMutations = () => {
	const { selectedDatabase } = useDatabaseStore();
	const queryClient = useQueryClient();
	const refresh = async () =>
		queryClient.invalidateQueries({ queryKey: redisKeyBrowserKeys.all });

	const createMutation = useMutation({
		mutationFn: (data: CreateKeySchemaType) =>
			createRedisKey({ db: selectedDatabase ?? "", data }).then(
				(response) => response.data.data,
			),
		onSuccess: refresh,
	});
	const actionMutation = useMutation({
		mutationFn: ({ key, data }: { key: string; data: KeyActionSchemaType }) =>
			applyRedisKeyAction({ db: selectedDatabase ?? "", key, data }).then(
				(response) => response.data.data,
			),
		onSuccess: refresh,
	});
	const deleteMutation = useMutation({
		mutationFn: ({
			key,
			expectedRevision,
			force,
		}: {
			key: string;
			expectedRevision: string;
			force?: boolean;
		}) =>
			deleteRedisKey({ db: selectedDatabase ?? "", key, expectedRevision, force }).then(
				(response) => response.data.data,
			),
		onSuccess: refresh,
	});

	return {
		createKey: (data: CreateKeySchemaType) =>
			toast
				.promise(createMutation.mutateAsync(data), {
					loading: "Creating Redis key…",
					success: "Redis key created",
					error: mutationError,
				})
				.unwrap(),
		applyAction: (key: string, data: KeyActionSchemaType) =>
			toast
				.promise(actionMutation.mutateAsync({ key, data }), {
					loading: "Applying Redis change…",
					success: "Redis change applied",
					error: mutationError,
				})
				.unwrap(),
		deleteKey: (key: string, expectedRevision: string, force?: boolean) =>
			toast
				.promise(deleteMutation.mutateAsync({ key, expectedRevision, force }), {
					loading: "Deleting Redis key…",
					success: "Redis key deleted",
					error: mutationError,
				})
				.unwrap(),
		isPending:
			createMutation.isPending || actionMutation.isPending || deleteMutation.isPending,
	};
};
