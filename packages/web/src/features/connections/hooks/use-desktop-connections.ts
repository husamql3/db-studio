import type {
	DesktopServerStatus,
	SaveConnectionInputSchemaType,
} from "@db-studio/shared/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { desktop } from "@/lib/desktop";

const connectionKeys = {
	list: () => ["desktop", "connections"] as const,
};

const requireDesktop = () => {
	if (!desktop) throw new Error("Saved connections are only available in the desktop app");
	return desktop;
};

// toast.promise returns the toast id, not the promise; hand callers the real promise so they
// can await completion and skip follow-up work on failure.
const withToast = <T>(
	promise: Promise<T>,
	messages: Parameters<typeof toast.promise<T>>[1],
) => {
	toast.promise(promise, messages);
	return promise;
};

export const useDesktopConnections = () => {
	const queryClient = useQueryClient();
	const invalidate = () => queryClient.invalidateQueries({ queryKey: connectionKeys.list() });

	const { data: connections = [], isLoading } = useQuery({
		queryKey: connectionKeys.list(),
		queryFn: () => requireDesktop().listConnections(),
	});

	const { mutateAsync: saveMutation } = useMutation({
		mutationFn: (input: SaveConnectionInputSchemaType) =>
			requireDesktop().saveConnection(input),
		onSuccess: invalidate,
	});

	const { mutateAsync: deleteMutation } = useMutation({
		mutationFn: (id: string) => requireDesktop().deleteConnection(id),
		onSuccess: invalidate,
	});

	const saveConnection = (input: SaveConnectionInputSchemaType) =>
		withToast(saveMutation(input), {
			loading: "Saving connection...",
			success: (saved) => `Saved ${saved.name}`,
			error: (error: Error) => error.message || "Failed to save connection",
		});

	const deleteConnection = (id: string, name: string) =>
		withToast(deleteMutation(id), {
			loading: "Deleting connection...",
			success: `Deleted ${name}`,
			error: (error: Error) => error.message || "Failed to delete connection",
		});

	return { connections, isLoading, saveConnection, deleteConnection };
};

export const useDesktopServer = () => {
	const [status, setStatus] = useState<DesktopServerStatus>({ state: "idle" });

	useEffect(() => {
		if (!desktop) return;
		void desktop.getServerStatus().then(setStatus);
		return desktop.onServerStatus(setStatus);
	}, []);

	const { mutateAsync: connectMutation } = useMutation({
		mutationFn: async (id: string) => {
			const result = await requireDesktop().connect(id);
			if (result.state === "error") throw new Error(result.message);
			return result;
		},
	});

	const { mutateAsync: disconnectMutation } = useMutation({
		mutationFn: () => requireDesktop().disconnect(),
	});

	const connect = (id: string, name: string) =>
		withToast(connectMutation(id), {
			loading: `Connecting to ${name}...`,
			success: `Connected to ${name}`,
			error: (error: Error) => error.message || `Could not connect to ${name}`,
		});

	const disconnect = () =>
		withToast(disconnectMutation(), {
			loading: "Disconnecting...",
			success: "Disconnected",
			error: (error: Error) => error.message || "Failed to disconnect",
		});

	return { status, connect, disconnect };
};
