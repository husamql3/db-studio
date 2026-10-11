import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { dropIndex as dropIndexRequest } from "@/shared/api";
import { indexKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";
import { useOverlayStore } from "@/stores/overlay.store";

type MutationError = Error & {
	details?: unknown;
};

export const useDropIndex = ({ tableName }: { tableName: string }) => {
	const queryClient = useQueryClient();
	const { closeOverlay } = useOverlayStore();
	const { selectedDatabase } = useDatabaseStore();

	const { mutateAsync: dropIndexMutation, isPending: isDroppingIndex } = useMutation<
		string,
		MutationError,
		string
	>({
		mutationFn: async (indexName) => {
			const res = await dropIndexRequest({ tableName, indexName, db: selectedDatabase });
			return res.data.data;
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: indexKeys.byTable(tableName),
				exact: false,
			});
			closeOverlay("indexes.drop-index");
		},
	});

	const dropIndex = async (indexName: string) =>
		toast.promise(dropIndexMutation(indexName), {
			loading: "Dropping index...",
			success: (message) => message || "Index dropped successfully",
			error: (error: MutationError) =>
				(typeof error.details === "string" && error.details) ||
				error.message ||
				"Failed to drop index",
		});

	return {
		dropIndex,
		isDroppingIndex,
	};
};
