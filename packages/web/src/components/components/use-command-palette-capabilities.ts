import { useLocation, useParams } from "@tanstack/react-router";
import { useDatabaseEngine } from "@/hooks/use-database-engine";
import { hasSection, type SectionId } from "@/lib/sections";
import { useDatabaseStore } from "@/stores/database.store";

export const NO_TABLE_HINT = "Select a table first";
const FIXED_SCHEMA_HINT = "Not available: this database's tables have a fixed schema";

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
	const canMutateSchema = engine?.schemaMutation !== false;

	// Record and schema sheets mount per-screen (table-screen.tsx,
	// schema-screen.tsx), so those commands only run on their own screen.
	const onTableScreen = pathname.startsWith("/table/");
	const onSchemaScreen = pathname.startsWith("/schema/");

	return {
		pathname,
		activeTable,
		dbType,
		hasSection: (id: SectionId) => hasSection(engine, id),
		canCreateTable: canMutateSchema,
		canEditRecords: Boolean(activeTable) && onTableScreen,
		recordsHint: !activeTable ? NO_TABLE_HINT : "Open the table data screen first",
		canEditSchema: Boolean(activeTable) && onSchemaScreen && canMutateSchema,
		schemaHint: !canMutateSchema
			? FIXED_SCHEMA_HINT
			: !activeTable
				? NO_TABLE_HINT
				: "Open the table schema screen first",
	};
};
