import { useQuery } from "@tanstack/react-query";
import type { BaseResponse, TableInfoSchemaType } from "shared/types";
import { api } from "@/lib/api";
import { useDatabaseStore } from "@/stores/database.store";
import { CONSTANTS } from "@/utils/constants";

export const useTablesList = () => {
	const { selectedDatabase } = useDatabaseStore();

	const {
		data: tablesList,
		isLoading: isLoadingTablesList,
		error: errorTablesList,
	} = useQuery({
		queryKey: [CONSTANTS.CACHE_KEYS.TABLES_LIST, selectedDatabase],
		queryFn: () => {
			const params = new URLSearchParams({ database: selectedDatabase ?? "" });
			return api.get<BaseResponse<TableInfoSchemaType[]>>("/tables", { params });
		},
		select: (res) => res.data.data,
		enabled: !!selectedDatabase,
	});

	return { tablesList, isLoadingTablesList, errorTablesList };
};
