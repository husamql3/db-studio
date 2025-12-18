import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useUpdateCell } from "@/hooks/use-update-cell";
import { useUpdateCellStore } from "@/stores/update-cell.store";

export const SaveBtn = () => {
	const { getUpdates, getUpdateCount } = useUpdateCellStore();
	const { updateCell, isUpdatingCell } = useUpdateCell();

	const handleSave = useCallback(() => {
		const updates = getUpdates();
		if (updates.length === 0) return;

		console.log("Saving updates:", updates);
		updateCell(updates);
	}, [getUpdates, updateCell]);

	// Hide button if no updates
	if (getUpdateCount() === 0) {
		return null;
	}

	const updateCount = getUpdateCount();

	return (
		<Button
			type="button"
			variant="default"
			className="h-8! border-l-0 border-y-0 border-r border-zinc-800 rounded-none bg-green-700 text-white hover:bg-green-800"
			onClick={handleSave}
			aria-label="Save changes to the table"
			disabled={isUpdatingCell}
		>
			Save Changes
			{updateCount > 1 && (
				<span className="ml-1.5 px-1.5 text-[10px] bg-white/20 border border-white/20 rounded">
					{updateCount}
				</span>
			)}
		</Button>
	);
};
