import {
	DATABASE_ENGINES,
	type DatabaseEngine,
	type DatabaseTypeSchema,
} from "@db-studio/shared/types";
import { Elysia } from "elysia";
import type { IDbAdapter } from "@/adapters/adapter.interface.js";
import { ADAPTERS, isDatabaseType } from "@/adapters/adapter.registry.js";
import { HTTPException } from "@/http-exception.js";
import { requestConnection } from "@/open-connections.js";

/**
 * Resolves the `/:dbType` path segment to its adapter. Runs before validation, so an
 * unknown database type is reported ahead of any query or body error.
 *
 * Each request reaches the connection its tab names in `X-Connection-Id`. One naming a closed
 * connection, or another engine than its connection's, is refused rather than sent to the wrong
 * database.
 */
export const adapterPlugin = new Elysia().derive({ as: "scoped" }, ({ params }) => {
	const { dbType = "" } = params;

	if (!isDatabaseType(dbType)) {
		throw new HTTPException(400, {
			message: `Invalid database type: "${dbType}". Supported types: ${Object.keys(ADAPTERS).join(", ")}`,
		});
	}

	const { dbType: connected } = requestConnection();

	if (connected !== dbType) {
		throw new HTTPException(409, {
			message: `The open connection is ${DATABASE_ENGINES[connected].label}. Reload the page.`,
		});
	}

	const adapter: IDbAdapter = ADAPTERS[dbType];

	return { dbType, adapter };
});

type Capability = "indexes" | "serverLogs" | "rowMutation" | "cellDefault" | "schemaMutation";

/** Why the engine cannot do an operation its traits leave out, or undefined when it can. */
const unsupportedReason = (engine: DatabaseEngine, capability: Capability) => {
	switch (capability) {
		case "indexes":
			return engine.indexes ? undefined : "Indexes are not supported for this database type";
		case "serverLogs":
			return engine.serverLogs
				? undefined
				: "Server logs are not supported for this database type";
		case "rowMutation":
			return engine.rowMutation ? undefined : engine.rowMutationReason;
		case "schemaMutation":
			return engine.schemaMutation
				? undefined
				: `Schema is fixed for ${engine.label} tables; this operation is not supported`;
		case "cellDefault":
			return engine.cellDefault
				? undefined
				: `${engine.label} cannot set a cell to its column default`;
	}
};

export const requireCapability = (
	dbType: DatabaseTypeSchema,
	capability: Capability,
): void => {
	const reason = unsupportedReason(DATABASE_ENGINES[dbType], capability);

	if (reason) throw new HTTPException(400, { message: reason });
};
