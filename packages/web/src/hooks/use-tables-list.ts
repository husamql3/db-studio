import { useQuery } from "@tanstack/react-query";
import { getTables } from "@/shared/api";
import { tableKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";

export const useTablesList = () => {
	const { selectedDatabase } = useDatabaseStore();

	const {
		data: tablesList,
		isLoading: isLoadingTablesList,
		error: errorTablesList,
	} = useQuery({
		queryKey: tableKeys.list(selectedDatabase),
		queryFn: () => getTables(selectedDatabase),
		select: (res) => res.data.data,
		enabled: !!selectedDatabase,
	});

	return { tablesList, isLoadingTablesList, errorTablesList };
};
