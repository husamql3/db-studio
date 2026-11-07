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

/** `connectionId` this tab works with; `undefined` until the server first answers. */
let ownConnectionId: string | null | undefined;

/**
 * The saved connections and the one this tab has open. Refetched on focus to notice that the
 * server restarted and closed it.
 */
export const useConnections = () => {
	const { data, isLoading, error } = useQuery({
		queryKey: connectionKeys.state(),
		queryFn: async () => {
			const state = (await getConnections()).data.data;
			// The first answer names this tab's connection, or the latest for a new tab. Adopted
			// here, before the app renders and sends database requests.
			if (ownConnectionId === undefined) {
				ownConnectionId = state.active?.connectionId ?? null;
				setConnectionId(ownConnectionId);
			}
			return state;
		},
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

/**
 * Drops everything cached for the previous database, including unsaved edits and open sheets, and
 * starts over at `/`. Query tabs stay.
 */
const useResetToConnection = () => {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	return async (state: ConnectionsStateSchemaType) => {
		ownConnectionId = state.active?.connectionId ?? null;
		setConnectionId(ownConnectionId);
		// A focus refetch still in flight would answer for the previous connection after this.
		await queryClient.cancelQueries({ queryKey: connectionKeys.state() });
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
 * This tab's connection is gone: the server restarted, or closed it to switch read-only. Its
 * cached data belongs to that database, so it starts over on the one the server now offers (none
 * after a close: the Connect page) and says why.
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
		if (
			previous === undefined ||
			previous === connectionId ||
			connectionId === ownConnectionId
		) {
			return;
		}
		void resetTo({ connections, active });
		const name = connections.find((c) => c.id === active?.id)?.name;
		toast.info(
			name
				? `Connection changed to ${name}`
				: active
					? "The connection changed"
					: "The connection was closed",
		);
	}, [isLoading, connectionId, connections, active, resetTo]);
};
