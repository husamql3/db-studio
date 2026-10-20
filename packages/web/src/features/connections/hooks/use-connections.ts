import type {
	ConnectionSummarySchemaType,
	ConnectionsStateSchemaType,
} from "@db-studio/shared/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useRowDetailsStore, useUpdateCellStore } from "@/features/tables";
import {
	connectSavedConnection,
	connectUrl,
	getConnections,
	setConnectionId,
} from "@/shared/api";
import { connectionKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";
import { useOverlayStore } from "@/stores/overlay.store";

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

/** `connectionId` of the last switch this tab made, so the watcher does not report it back. */
let ownConnectionId: string | null = null;

/**
 * Drops everything cached for the previous database, including unsaved edits and open sheets, and
 * starts over at `/`. Query tabs stay.
 */
const useResetToConnection = () => {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	return (state: ConnectionsStateSchemaType) => {
		ownConnectionId = state.active?.connectionId ?? null;
		setConnectionId(ownConnectionId);
		queryClient.removeQueries({
			predicate: (query) => query.queryKey[0] !== connectionKeys.state()[0],
		});
		queryClient.setQueryData(connectionKeys.state(), state);
		useDatabaseStore.setState({ selectedDatabase: null, dbType: null });
		useUpdateCellStore.getState().clearUpdates();
		useRowDetailsStore.getState().clearRowDetails();
		useOverlayStore.getState().closeAllOverlays();
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

	/** A pasted URL: the test runs behind a loading toast; a failure also shows under the field. */
	const connectPastedUrl = (url: string) =>
		toast.promise(urlMutation.mutateAsync(url), {
			loading: "Connecting…",
			success: "Connected",
			error: (error: MutationError) =>
				active
					? `${errorMessage(error)}. Still on the previous connection.`
					: errorMessage(error),
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
		connectUrl: connectPastedUrl,
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
	const seen = useRef<string | null | undefined>(undefined);
	const connectionId = active?.connectionId ?? null;

	useEffect(() => {
		// Nothing loaded yet is not a connection: the first answer must not read as a switch.
		if (isLoading) return;
		const previous = seen.current;
		seen.current = connectionId;
		if (previous === undefined) setConnectionId(connectionId);
		if (
			previous === undefined ||
			previous === connectionId ||
			connectionId === ownConnectionId
		) {
			return;
		}
		resetTo({ connections, active });
		const name = connections.find((c) => c.id === active?.id)?.name;
		toast.info(name ? `Connection changed to ${name}` : "The connection changed");
	}, [isLoading, connectionId, connections, active, resetTo]);
};
