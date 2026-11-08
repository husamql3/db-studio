import { DATABASE_ENGINES } from "@db-studio/shared/types";
import { Elysia } from "elysia";
import { adapterRegistry, getAdapter } from "@/adapters/adapter.registry.js";
import { getDbType, getOpenConnection } from "@/db-manager.js";
import { HTTPException } from "@/http-exception.js";

/**
 * Resolves the `/:dbType` path segment to its registered adapter. Runs before validation, so an
 * unknown database type is reported ahead of any query or body error.
 *
 * Each request reaches the connection its tab names in `X-Connection-Id`. One naming a closed
 * connection, or another engine than its connection's, is refused rather than sent to the wrong
 * database.
 */
export const adapterPlugin = new Elysia().derive({ as: "scoped" }, ({ params, headers }) => {
	const { dbType = "" } = params;
	if (!adapterRegistry.has(dbType)) {
		throw new HTTPException(400, {
			message: `Invalid database type: "${dbType}". Supported types: ${adapterRegistry.getSupportedTypes().join(", ")}`,
		});
	}
	// The server restarted since this tab connected.
	const sent = headers["x-connection-id"];
	if (sent && !getOpenConnection(sent)) {
		throw new HTTPException(409, { message: "The connection closed. Reload the page." });
	}
	const connected = getDbType();
	if (connected !== dbType) {
		throw new HTTPException(409, {
			message: `The open connection is ${DATABASE_ENGINES[connected].label}. Reload the page.`,
		});
	}
	return { dbType, adapter: getAdapter(dbType) };
});
