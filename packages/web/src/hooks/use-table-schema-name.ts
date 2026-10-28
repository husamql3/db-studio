import { useSearch } from "@tanstack/react-router";
import { CONSTANTS } from "@/utils/constants";

/**
 * The open table's schema, from the URL. Undefined on engines without schemas and on links
 * that predate it; the server then resolves the bare table name through the search path.
 * Read through the router, not nuqs: nuqs does not see router navigations, so a mounted
 * component would keep the previous table's schema.
 */
export const useTableSchemaName = () => {
	const search = useSearch({ strict: false });
	const schemaName = CONSTANTS.TABLE_SCHEMA in search && search[CONSTANTS.TABLE_SCHEMA];
	return typeof schemaName === "string" ? schemaName : undefined;
};
