import type {
	ConnectionSummarySchemaType,
	ConnectionsStateSchemaType,
} from "@db-studio/shared/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { connectSavedConnection, connectUrl, getConnections } from "@/shared/api";
import { connectionKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";

type MutationError = Error & { details?: unknown };

export const errorMessage = (error: MutationError) =>
	(typeof error.details === "string" && error.details) || error.message;

/** The saved connections and the open one. Refetched on focus to notice a switch in another tab. */
export const useConnections = () => {
	const { data, isLoading, error } = useQuery({
		queryKey: connectionKeys.state(),
		queryFn: async () => (await getConnections()).data.data,
		refetchOnWindowFocus: true,
		staleTime: 0,
	});
	return {
		connections: data?.connections ?? [],
		active: data?.active ?? null,
		isLoading,
		error,
	};
};

/** `connectedAt` of the last switch this tab made, so the watcher does not report it back. */
let ownConnectedAt: number | null = null;

/** Drops everything cached for the previous database and starts over at `/`. Query tabs stay. */
const useResetToConnection = () => {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	return (state: ConnectionsStateSchemaType) => {
		ownConnectedAt = state.active?.connectedAt ?? null;
		queryClient.removeQueries({
			predicate: (query) => query.queryKey[0] !== connectionKeys.state()[0],
		});
		queryClient.setQueryData(connectionKeys.state(), state);
		useDatabaseStore.setState({ selectedDatabase: null, dbType: null });
		void navigate({ to: "/", search: {} });
	};
};

export const useConnect = () => {
	const resetTo = useResetToConnection();
	const { active } = useConnections();

	const urlMutation = useMutation<ConnectionsStateSchemaType, MutationError, string>({
		mutationFn: async (url) => (await connectUrl(url)).data.data,
		onSuccess: resetTo,
	});

	const savedMutation = useMutation<
		ConnectionsStateSchemaType,
		MutationError,
		ConnectionSummarySchemaType
	>({
		mutationFn: async ({ id }) => (await connectSavedConnection(id)).data.data,
		onSuccess: resetTo,
	});

	/** One click on a saved connection: the test runs behind a loading toast. */
	const connectSaved = (connection: ConnectionSummarySchemaType) =>
		toast.promise(savedMutation.mutateAsync(connection), {
			loading: `Connecting to ${connection.name}…`,
			success: `Connected to ${connection.name}`,
			error: (error: MutationError) =>
				active
					? `${errorMessage(error)}. Still on the previous connection.`
					: errorMessage(error),
		});

	return {
		connectUrl: urlMutation.mutate,
		isConnectingUrl: urlMutation.isPending,
		urlError: urlMutation.error ? errorMessage(urlMutation.error) : null,
		clearUrlError: urlMutation.reset,
		connectSaved,
	};
};

/**
 * Another tab switched the connection: this tab's cached data belongs to the old database, so
 * it starts over at `/` and says why.
 */
export const useConnectionChangeWatcher = () => {
	const { active, connections, isLoading } = useConnections();
	const resetTo = useResetToConnection();
	const seen = useRef<number | null | undefined>(undefined);
	const connectedAt = active?.connectedAt ?? null;

	useEffect(() => {
		// Nothing loaded yet is not a connection: the first answer must not read as a switch.
		if (isLoading) return;
		const previous = seen.current;
		seen.current = connectedAt;
		if (previous === undefined || previous === connectedAt || connectedAt === ownConnectedAt) {
			return;
		}
		resetTo({ connections, active });
		const name = connections.find((c) => c.id === active?.id)?.name;
		toast.info(name ? `Connection changed to ${name}` : "The connection changed");
	}, [isLoading, connectedAt, connections, active, resetTo]);
};
