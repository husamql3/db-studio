import { IconRefresh } from "@tabler/icons-react";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useTableCols } from "@/hooks/use-table-cols";
import { useTableData } from "@/hooks/use-table-data";

export const RefetchBtn = () => {
	const { refetchTableData, isRefetchingTableData } = useTableData();
	const { refetchTableCols, isRefetchingTableCols } = useTableCols();

	const handleRefetch = useCallback(() => {
		Promise.all([refetchTableData(), refetchTableCols()]);
	}, [refetchTableData, refetchTableCols]);

	return (
		<Button
			type="button"
			variant="ghost"
			className="size-8! aspect-square border-l-0 border-y-0 border-r border-zinc-800 rounded-none"
			onClick={handleRefetch}
			aria-label="Refetch table data and columns"
			disabled={isRefetchingTableData || isRefetchingTableCols}
		>
			<IconRefresh className="size-4" />
		</Button>
	);
};
