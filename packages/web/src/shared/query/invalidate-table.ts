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

/** Refreshes every table's columns, rows and indexes and the tables list, as a query can change any of them. */
export const invalidateAllTables = (queryClient: QueryClient) =>
	Promise.all([
		queryClient.invalidateQueries({ queryKey: tableKeys.allColumns() }),
		queryClient.invalidateQueries({ queryKey: tableKeys.allData() }),
		queryClient.invalidateQueries({ queryKey: indexKeys.all() }),
		queryClient.invalidateQueries({ queryKey: tableKeys.lists() }),
	]);

/** Refreshes what a row write makes stale: the table's rows and the tables list's row counts. */
export const invalidateTableRows = (queryClient: QueryClient, tableName: string) =>
	Promise.all([
		queryClient.invalidateQueries({ queryKey: tableKeys.dataByTable(tableName) }),
		queryClient.invalidateQueries({ queryKey: tableKeys.lists() }),
	]);

/**
 * Drops a renamed or deleted table's columns, rows and indexes rather than invalidating them: a
 * refetch would ask for a table that no longer exists.
 */
export const forgetTable = (queryClient: QueryClient, tableName: string) => {
	for (const queryKey of [
		tableKeys.dataByTable(tableName),
		tableKeys.columnsByTable(tableName),
		indexKeys.byTable(tableName),
	]) {
		queryClient.removeQueries({ queryKey });
	}
};
