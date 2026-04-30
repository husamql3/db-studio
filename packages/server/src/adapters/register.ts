import { adapterRegistry } from "@/adapters/adapter.registry.js";

/**
 * Registers all DB adapters with the registry before routes are mounted.
 */
export function registerAdapters(): void {
	// adapterRegistry.register("pg", new PgAdapter());
	// adapterRegistry.register("mysql", new MySqlAdapter());
	// adapterRegistry.register("mssql", new MsSqlAdapter());
	// adapterRegistry.register("mongodb", new MongoAdapter());

	void adapterRegistry; // referenced so the import is not tree-shaken
}
