import { DATABASE_ENGINES } from "@db-studio/shared/types";
import { Elysia } from "elysia";
import { adapterRegistry, getAdapter } from "@/adapters/adapter.registry.js";
import { getDbType } from "@/db-manager.js";
import { HTTPException } from "@/http-exception.js";

/**
 * Resolves the `/:dbType` path segment to its registered adapter. Runs before validation, so an
 * unknown database type is reported ahead of any query or body error.
 *
 * The connection can change while a browser tab still shows the previous one, so a request for
 * another engine than the open connection's is refused rather than sent to the wrong database.
 */
export const adapterPlugin = new Elysia().derive({ as: "scoped" }, ({ params }) => {
	const { dbType = "" } = params;
	if (!adapterRegistry.has(dbType)) {
		throw new HTTPException(400, {
			message: `Invalid database type: "${dbType}". Supported types: ${adapterRegistry.getSupportedTypes().join(", ")}`,
		});
	}
	const connected = getDbType();
	if (connected !== dbType) {
		throw new HTTPException(409, {
			message: `The open connection is ${DATABASE_ENGINES[connected].label}. Reload the page.`,
		});
	}
	return { dbType, adapter: getAdapter(dbType) };
});
