import type { Row } from "@tanstack/react-table";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useDeleteCells } from "@/hooks/use-delete-cell";
import type { TableRecord } from "@/types/table.type";
export const DeleteBtn = ({ selectedRows }: { selectedRows: Row<TableRecord>[] }) => {
	console.log(selectedRows);
	const { deleteCells, isDeletingCells } = useDeleteCells();

	const handleDelete = useCallback(async () => {
		const rowData = selectedRows.map((row) => row.original);

		const result = await deleteCells(rowData);
		console.log(result);
	}, [deleteCells, selectedRows]);

	if (selectedRows?.length === 0) {
		return null;
	}

	return (
		<Button
			type="button"
			variant="destructive"
			className="h-8! border-l-0 border-y-0 border-r border-zinc-800 text-white rounded-none"
			onClick={handleDelete}
			aria-label="Delete the selected record"
			disabled={isDeletingCells}
		>
			Delete Record
			{selectedRows?.length > 1 && (
				<span className="ml-1.5 px-1.5 text-[10px] bg-white/20 border border-white/20 rounded">
					{selectedRows?.length}
				</span>
			)}
		</Button>
	);
};
