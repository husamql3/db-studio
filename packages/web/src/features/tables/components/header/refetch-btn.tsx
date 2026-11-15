import { Button } from "@db-studio/ui/button";
import { RefreshCw } from "lucide-react";
import { useCallback } from "react";
import { useTableCols } from "@/hooks/use-table-cols";
import { useTableData } from "@/hooks/use-table-data";
import { useTableSchemaName } from "@/hooks/use-table-schema-name";
import { useGridPage } from "../../hooks/use-grid-page";

export const RefetchBtn = ({ tableName }: { tableName: string }) => {
	const schemaName = useTableSchemaName();

	const { refetchTableData, isRefetchingTableData } = useTableData(
		useGridPage(tableName, schemaName),
	);

	const { refetchTableCols, isRefetchingTableCols } = useTableCols({ tableName, schemaName });

	const handleRefetch = useCallback(() => {
		Promise.all([refetchTableData(), refetchTableCols()]);
	}, [refetchTableData, refetchTableCols]);

	return (
		<Button
			size="icon-segment"
			type="button"
			variant="ghost"
			className="border-l-0 border-r border-border text-muted-foreground hover:text-foreground hover:bg-muted/60"
			onClick={handleRefetch}
			aria-label="Refetch table data and columns"
			disabled={isRefetchingTableData || isRefetchingTableCols}
		>
			<RefreshCw />
		</Button>
	);
};
