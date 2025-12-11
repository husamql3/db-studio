import { useMutation } from "@tanstack/react-query";
import { useActiveTableStore } from "@/stores/active-table.store";

export const useDeleteCells = () => {
	const { activeTable } = useActiveTableStore();
	const { mutateAsync: deleteCells, isPending: isDeletingCells } = useMutation({
		mutationFn: async (rowIndices: number[]) => {
			if (!activeTable) {
				throw new Error("No active table selected");
			}

			const payload = {
				tableName: activeTable,
				rowIndices: rowIndices,
			};
			console.log("payload", payload);

			// const response = await fetch("http://localhost:3000/records", {
			//   method: "DELETE",
			//   headers: {
			//     "Content-Type": "application/json",
			//   },
			//   body: JSON.stringify(payload),
			// });

			// const result = await response.json();

			// if (!response.ok || !result.success) {
			//   throw new Error(result.message || result.detail || "Failed to delete records");
			// }

			return { success: true, message: "Records deleted successfully" };
		},
	});

	return {
		deleteCells,
		isDeletingCells,
	};
};
