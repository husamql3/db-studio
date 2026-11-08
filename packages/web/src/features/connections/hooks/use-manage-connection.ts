import type {
	ConnectionSummarySchemaType,
	ConnectionsStateSchemaType,
	UpdateConnectionSchemaType,
} from "@db-studio/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { deleteConnection, updateConnection } from "@/shared/api";
import { connectionKeys } from "@/shared/query/keys";
import { errorMessage, useConnect, useConnections } from "./use-connections";

type MutationError = Error & { details?: unknown };

/** Rename, recolor, switch read-only or forget a saved connection. Forgetting the open one leaves it open. */
export const useManageConnection = (connection: ConnectionSummarySchemaType) => {
	const queryClient = useQueryClient();
	const { active } = useConnections();
	const { connectSaved } = useConnect();

	const setState = (
		change: (state: ConnectionsStateSchemaType) => ConnectionsStateSchemaType,
	) =>
		queryClient.setQueryData<ConnectionsStateSchemaType>(connectionKeys.state(), (state) =>
			state ? change(state) : state,
		);

	const updateMutation = useMutation<
		ConnectionSummarySchemaType,
		MutationError,
		UpdateConnectionSchemaType
	>({
		mutationFn: async (data) => (await updateConnection(connection.id, data)).data.data,
		onSuccess: (updated) =>
			setState((state) => ({
				...state,
				connections: state.connections.map((c) => (c.id === updated.id ? updated : c)),
			})),
	});

	const deleteMutation = useMutation<string, MutationError, void>({
		mutationFn: async () => (await deleteConnection(connection.id)).data.data,
		onSuccess: () =>
			setState((state) => ({
				connections: state.connections.filter((c) => c.id !== connection.id),
				active:
					state.active?.id === connection.id ? { ...state.active, id: null } : state.active,
			})),
	});

	const rename = (name: string) =>
		toast.promise(updateMutation.mutateAsync({ name }), {
			loading: "Renaming connection…",
			success: "Connection renamed",
			error: (error: MutationError) => errorMessage(error) || "Failed to rename connection",
		});

	/** The dot changes in place, so only a failure is worth a toast. */
	const setColor = (color: UpdateConnectionSchemaType["color"]) =>
		toast.promise(updateMutation.mutateAsync({ color }), {
			error: (error: MutationError) => errorMessage(error) || "Failed to change the color",
		});

	/** The server closes the connection open in the old mode, so this tab reconnects to it. */
	const setReadOnly = (readOnly: boolean) =>
		toast.promise(
			updateMutation.mutateAsync({ readOnly }).then((updated) => {
				if (active?.id === updated.id) void connectSaved(updated);
			}),
			{
				error: (error: MutationError) =>
					errorMessage(error) || "Failed to change read-only mode",
			},
		);

	const remove = () =>
		toast.promise(deleteMutation.mutateAsync(), {
			loading: "Removing connection…",
			success: "Connection removed",
			error: (error: MutationError) => errorMessage(error) || "Failed to remove connection",
		});

	return { rename, setColor, setReadOnly, remove };
};
