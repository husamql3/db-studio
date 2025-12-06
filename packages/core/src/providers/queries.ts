import { queryOptions } from "@tanstack/react-query";
import { getTableCols } from "@/services/get-table-cols.service";
import { getTableData } from "@/services/get-table-data.service";
import { getTableList } from "@/services/get-table-list.service";
import { CACHE_KEYS } from "@/utils/constants/constans";

export const queries = {
	tableCols: (tableName: string) =>
		queryOptions({
			queryKey: [CACHE_KEYS.TABLE_COLS, tableName],
			queryFn: () => getTableCols(tableName),
		}),
	tableData: (tableName: string, page: number, pageSize: number) =>
		queryOptions({
			queryKey: [CACHE_KEYS.TABLE_DATA, tableName, page, pageSize],
			queryFn: () => getTableData(tableName, page, pageSize),
		}),
	tablesList: () =>
		queryOptions({
			queryKey: [CACHE_KEYS.TABLES_LIST],
			queryFn: () => getTableList(),
		}),
};
