import { useLocation, useParams } from "@tanstack/react-router";
import { useDatabaseEngine } from "@/hooks/use-database-engine";
import { useIsKeyValue, useIsSchemaless } from "@/hooks/use-is-schemaless";
import { hasSection, type SectionId } from "@/lib/sections";
import { useDatabaseStore } from "@/stores/database.store";

export const NO_TABLE_HINT = "Select a table first";
const SCHEMALESS_HINT = "Not available for schemaless databases";

/**
 * Which commands the current route and database can actually run, plus the
 * hint shown on the ones that cannot. Separated from the palette so the
 * gating rules change independently of the command list's presentation.
 */
export const useCommandPaletteCapabilities = () => {
	const { pathname } = useLocation();
	const routeParams = useParams({ strict: false });
	const activeTable = (routeParams as { table?: string }).table ?? null;
	const { dbType } = useDatabaseStore();
	const engine = useDatabaseEngine();
	const isSchemaless = useIsSchemaless();
	const isKeyValue = useIsKeyValue();

	// Create-table targets SQL-style schemas. Schemaless databases (MongoDB
	// collections, Redis keys) get their own entry points instead.
	// Record and schema sheets mount per-screen (table-screen.tsx,
	// schema-screen.tsx), so those commands only run on their own screen.
	// Schema DDL additionally needs a database with real schemas.
	const onTableScreen = pathname.startsWith("/table/");
	const onSchemaScreen = pathname.startsWith("/schema/");

	return {
		pathname,
		activeTable,
		dbType,
		isKeyValue,
		hasSection: (id: SectionId) => hasSection(engine, id),
		canCreateTable: !isSchemaless,
		canEditRecords: Boolean(activeTable) && onTableScreen,
		recordsHint: !activeTable ? NO_TABLE_HINT : "Open the table data screen first",
		canEditSchema: Boolean(activeTable) && onSchemaScreen && !isSchemaless,
		schemaHint: isSchemaless
			? SCHEMALESS_HINT
			: !activeTable
				? NO_TABLE_HINT
				: "Open the table schema screen first",
	};
};
