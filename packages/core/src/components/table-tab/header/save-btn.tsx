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
			size="sm"
			onClick={handleSave}
			disabled={isUpdatingCell}
			className="rounded-none text-xs h-9! border-r border-zinc-800 flex items-center justify-center font-medium transition-colors"
		>
			Save Changes
			{updateCount > 1 && (
				<span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-white/20 rounded">
					{updateCount}
				</span>
			)}
		</Button>
	);
};
