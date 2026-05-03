import { adapterRegistry } from "@/adapters/adapter.registry.js";
import { MongoAdapter } from "@/adapters/mongo/mongo.adapter.js";
import { MsSqlAdapter } from "@/adapters/mssql/mssql.adapter.js";
import { MySqlAdapter } from "@/adapters/mysql/mysql.adapter.js";
import { PgAdapter } from "@/adapters/pg/pg.adapter.js";

/**
 * Registers all DB adapters with the registry before routes are mounted.
 */
export function registerAdapters(): void {
	adapterRegistry.register("pg", new PgAdapter());
	adapterRegistry.register("mysql", new MySqlAdapter());
	adapterRegistry.register("mssql", new MsSqlAdapter());
	adapterRegistry.register("mongodb", new MongoAdapter());
}
