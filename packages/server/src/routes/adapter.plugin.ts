import { Elysia } from "elysia";
import { adapterRegistry, getAdapter } from "@/adapters/adapter.registry.js";
import { HTTPException } from "@/http-exception.js";

/**
 * Resolves the `/:dbType` path segment to its registered adapter. Runs before validation, so an
 * unknown database type is reported ahead of any query or body error.
 */
export const adapterPlugin = new Elysia().derive({ as: "scoped" }, ({ params }) => {
	const { dbType = "" } = params;
	if (!adapterRegistry.has(dbType)) {
		throw new HTTPException(400, {
			message: `Invalid database type: "${dbType}". Supported types: ${adapterRegistry.getSupportedTypes().join(", ")}`,
		});
	}
	return { dbType, adapter: getAdapter(dbType) };
});
