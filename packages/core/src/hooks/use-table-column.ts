import { useQuery } from "@tanstack/react-query";
import type { ColumnInfo } from "shared/types";
import { fetcher } from "@/lib/fetcher";
import { useDatabaseStore } from "@/stores/database.store";
import { CONSTANTS } from "@/utils/constants";

export const useTableColumn = ({
	tableName,
	columnName,
}: {
	tableName: string;
	columnName: string | null;
}) => {
	const { selectedDatabase } = useDatabaseStore();

	const {
		data: columnData,
		isLoading: isLoadingColumn,
		isRefetching: isRefetchingColumn,
		error: errorColumn,
		refetch: refetchColumn,
	} = useQuery<ColumnInfo | null, Error>({
		queryKey: [
			CONSTANTS.CACHE_KEYS.TABLE_COLUMNS,
			tableName,
			columnName,
			selectedDatabase,
		],
		queryFn: () =>
			fetcher.get<ColumnInfo | null>(
				`/tables/${tableName}/columns/${columnName}`,
				{
					database: selectedDatabase,
				},
			),
		enabled: !!tableName && !!columnName && !!selectedDatabase,
	});

	return {
		columnData,
		isLoadingColumn,
		isRefetchingColumn,
		errorColumn,
		refetchColumn,
	};
};
