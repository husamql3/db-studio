import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useDeleteCells } from "@/hooks/use-delete-cells";
import { useActiveTableStore } from "@/stores/active-table.store";

export const DeleteBtn = () => {
	const { selectedRowIndices } = useActiveTableStore();
	const { deleteCells, isDeletingCells } = useDeleteCells();

	// console.log("DeleteBtn render, selectedRowIndices:", selectedRowIndices, "isDeletingCells:", isDeletingCells);

	const handleDelete = useCallback(() => {
		console.log("handleDelete called, selectedRowIndices:", selectedRowIndices);
	}, [selectedRowIndices, deleteCells]);

	// const handleDelete = async () => {
	//   // console.log("handleDelete called, selectedRowIndices:", selectedRowIndices);
	//   await deleteCells(selectedRowIndices);
	//   // console.log("deleted", selectedRowIndices);
	// };

	// if (selectedRowIndices.length === 0) {
	//   return null;
	// }

	return (
		<Button
			type="button"
			variant="destructive"
			size="sm"
			className="rounded-none text-xs h-9! border-r border-zinc-800 flex items-center justify-center font-medium transition-colors"
			onClick={handleDelete}
			// disabled={isDeletingCells}
		>
			Delete
			{selectedRowIndices.length > 0 && (
				<span className="px-1.5 py-0.5  text-[10px] bg-white/20 rounded">
					{selectedRowIndices.length}
				</span>
			)}
		</Button>
	);
};
