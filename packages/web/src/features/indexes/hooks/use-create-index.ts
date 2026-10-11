import type { CreateIndexSchemaType } from "@db-studio/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createIndex as createIndexRequest } from "@/shared/api";
import { indexKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";
import { useOverlayStore } from "@/stores/overlay.store";

type MutationError = Error & {
	details?: unknown;
};

export const useCreateIndex = ({ tableName }: { tableName: string }) => {
	const queryClient = useQueryClient();
	const { closeOverlay } = useOverlayStore();
	const { selectedDatabase } = useDatabaseStore();

	const { mutateAsync: createIndexMutation, isPending: isCreatingIndex } = useMutation<
		string,
		MutationError,
		CreateIndexSchemaType
	>({
		mutationFn: async (data) => {
			const res = await createIndexRequest({ tableName, data, db: selectedDatabase });
			return res.data.data;
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: indexKeys.byTable(tableName),
				exact: false,
			});
			closeOverlay("indexes.create-index");
		},
	});

	const createIndex = async (data: CreateIndexSchemaType) =>
		toast.promise(createIndexMutation(data), {
			loading: "Creating index...",
			success: (message) => message || "Index created successfully",
			error: (error: MutationError) =>
				(typeof error.details === "string" && error.details) ||
				error.message ||
				"Failed to create index",
		});

	return {
		createIndex,
		isCreatingIndex,
	};
};
