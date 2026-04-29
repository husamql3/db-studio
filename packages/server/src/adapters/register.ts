import { adapterRegistry } from "./adapter.registry.js";

/**
 * Registers all DB adapters with the registry before routes are mounted.
 * Adapters are added here as they are implemented (Phases 4–7 of the revamp).
 *
 * Phase 4: adapterRegistry.register("pg",      new PgAdapter());
 * Phase 5: adapterRegistry.register("mysql",   new MySqlAdapter());
 * Phase 6: adapterRegistry.register("mssql",   new MsSqlAdapter());
 * Phase 7: adapterRegistry.register("mongodb", new MongoAdapter());
 */
export function registerAdapters(): void {
	void adapterRegistry; // referenced so the import is not tree-shaken
}
