import type { Table } from "@tanstack/react-table";
import type { Virtualizer } from "@tanstack/react-virtual";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useUpdateCell } from "@/hooks/use-update-cell";
import { useTableReloadStore } from "@/stores/table-reload.store";
import { useUpdateCellStore } from "@/stores/update-cell.store";

export const ClearBtn = ({
	table,
	rowVirtualizer,
}: {
	table: Table<Record<string, unknown>>;
	rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
}) => {
	const { triggerReload } = useTableReloadStore();
	const { getUpdateCount, clearUpdates } = useUpdateCellStore();
	const { isUpdatingCell } = useUpdateCell();

	const handleClearUpdates = useCallback(async () => {
		// Clear all pending updates
		clearUpdates();

		// Reset table state
		table.resetRowSelection();

		// Force virtualizer to remeasure rows
		rowVirtualizer.measure();

		// Trigger component reload to refetch data and show loading spinner
		triggerReload();
	}, [clearUpdates, table, rowVirtualizer, triggerReload]);

	if (getUpdateCount() === 0) {
		return null;
	}

	return (
		<Button
			type="button"
			variant="secondary"
			size="sm"
			className="rounded-none text-xs h-9! border-r border-zinc-800 flex items-center justify-center font-medium transition-colors"
			onClick={handleClearUpdates}
			disabled={isUpdatingCell}
		>
			Clear Changes
		</Button>
	);
};
