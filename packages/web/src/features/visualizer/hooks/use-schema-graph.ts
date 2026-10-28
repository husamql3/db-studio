import { useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { useMemo } from "react";
import { buildSchemaGraph } from "@/features/visualizer/lib/schema-graph";
import { getSchemaGraph } from "@/shared/api";
import { tableKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";
import { CONSTANTS } from "@/utils/constants";

export const useSchemaGraph = () => {
	const { selectedDatabase } = useDatabaseStore();
	const [schema] = useQueryState(CONSTANTS.ACTIVE_SCHEMA, { defaultValue: "all" });

	const { data, isLoading, error } = useQuery({
		queryKey: tableKeys.graph(selectedDatabase),
		queryFn: () => getSchemaGraph(selectedDatabase),
		select: (res) => res.data.data,
		enabled: !!selectedDatabase,
	});

	const graph = useMemo(() => buildSchemaGraph(data ?? [], schema), [data, schema]);

	return { ...graph, isLoading, error };
};
