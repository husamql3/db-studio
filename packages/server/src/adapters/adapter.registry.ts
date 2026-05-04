import type { DatabaseTypeSchema } from "@db-studio/shared/types/database.types.js";
import { HTTPException } from "hono/http-exception";
import type { IDbAdapter } from "./adapter.interface.js";

export class AdapterRegistry {
	private adapters = new Map<DatabaseTypeSchema, IDbAdapter>();

	register(type: DatabaseTypeSchema, adapter: IDbAdapter): void {
		this.adapters.set(type, adapter);
	}

	get(type: DatabaseTypeSchema): IDbAdapter {
		const adapter = this.adapters.get(type);
		if (!adapter) {
			throw new HTTPException(400, {
				message: `Unsupported database type: "${type}". Supported types: ${this.getSupportedTypes().join(", ")}`,
			});
		}
		return adapter;
	}

	has(type: string): type is DatabaseTypeSchema {
		return this.adapters.has(type as DatabaseTypeSchema);
	}

	getSupportedTypes(): DatabaseTypeSchema[] {
		return [...this.adapters.keys()];
	}
}

export const adapterRegistry = new AdapterRegistry();

/**
 * Drop-in replacement for getDaoFactory() — resolves to the registered
 * IDbAdapter for the given database type.
 */
export function getAdapter(dbType: DatabaseTypeSchema): IDbAdapter {
	return adapterRegistry.get(dbType);
}
