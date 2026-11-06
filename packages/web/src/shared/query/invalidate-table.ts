import type { QueryClient } from "@tanstack/react-query";
import { indexKeys, tableKeys } from "./keys";

/** Refreshes everything a schema change can make stale: columns, rows, indexes and the tables list. */
export const invalidateTable = (queryClient: QueryClient, tableName: string) =>
	Promise.all([
		queryClient.invalidateQueries({ queryKey: tableKeys.columnsByTable(tableName) }),
		queryClient.invalidateQueries({ queryKey: tableKeys.dataByTable(tableName) }),
		queryClient.invalidateQueries({ queryKey: indexKeys.byTable(tableName) }),
		queryClient.invalidateQueries({ queryKey: tableKeys.lists() }),
	]);
