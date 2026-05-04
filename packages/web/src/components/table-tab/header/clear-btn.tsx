import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useUpdateCell } from "@/hooks/use-update-cell";
import { useUpdateCellStore } from "@/stores/update-cell.store";
export const ClearBtn = () => {
	const { getUpdateCount, clearUpdates } = useUpdateCellStore();
	const { isUpdatingCell } = useUpdateCell();

	const handleClearUpdates = useCallback(() => {
		clearUpdates();
	}, [clearUpdates]);

	if (getUpdateCount() === 0) {
		return null;
	}

	return (
		<Button
			type="button"
			variant="secondary"
			className="h-8! border-l-0 border-y-0 border-r border-zinc-800 rounded-none"
			onClick={handleClearUpdates}
			aria-label="Clear changes to the table"
			disabled={isUpdatingCell}
		>
			Clear Changes
		</Button>
	);
};
