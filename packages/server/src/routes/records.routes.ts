import {
	addRecordSchema,
	bulkInsertRecordsSchema,
	DATABASE_ENGINES,
	deleteRecordSchema,
	tableQuerySchema,
	updateRecordsSchema,
} from "@db-studio/shared/types";
import { Elysia } from "elysia";
import { HTTPException } from "@/http-exception.js";
import { adapterPlugin, requireCapability } from "@/routes/adapter.plugin.js";

export const recordsRoutes = new Elysia({ prefix: "/records" })
	.use(adapterPlugin)

	.post(
		"/",
		async ({ adapter, query: { db, schemaName }, body: { tableName, data } }) => {
			const { insertedCount } = await adapter.addRecord({
				db,
				schemaName,
				params: { tableName, data },
			});

			return {
				data: `Record inserted into "${tableName}" with ${insertedCount} rows inserted`,
			};
		},
		{ query: tableQuerySchema, body: addRecordSchema },
	)

	.patch(
		"/",
		async ({ adapter, dbType, query: { db, schemaName }, body }) => {
			if (!DATABASE_ENGINES[dbType].cellDefault && body.updates.some((u) => u.useDefault))
				throw new HTTPException(400, {
					message: `${DATABASE_ENGINES[dbType].label} cannot set a cell to its column default`,
				});
			requireCapability(dbType, "rowMutation");
			const { updatedCount } = await adapter.updateRecords({ params: body, schemaName, db });

			return { data: `Updated ${updatedCount} records in "${body.tableName}"` };
		},
		{ query: tableQuerySchema, body: updateRecordsSchema },
	)

	.delete(
		"/",
		async ({
			adapter,
			dbType,
			query: { db, schemaName },
			body: { tableName, primaryKeys },
			status,
		}) => {
			requireCapability(dbType, "rowMutation");

			const { deletedCount, fkViolation, relatedRecords } = await adapter.deleteRecords({
				tableName,
				schemaName,
				primaryKeys,
				db,
			});

			if (fkViolation) {
				return status(409, { data: { deletedCount: 0, fkViolation: true, relatedRecords } });
			}

			return { data: { deletedCount, fkViolation: false, relatedRecords: [] } };
		},
		{ query: tableQuerySchema, body: deleteRecordSchema },
	)

	.delete(
		"/force",
		async ({
			adapter,
			dbType,
			query: { db, schemaName },
			body: { tableName, primaryKeys },
		}) => {
			requireCapability(dbType, "rowMutation");

			return {
				data: await adapter.forceDeleteRecords({ tableName, schemaName, primaryKeys, db }),
			};
		},
		{ query: tableQuerySchema, body: deleteRecordSchema },
	)

	.post(
		"/bulk",
		async ({ adapter, query: { db, schemaName }, body: { tableName, records } }) => ({
			data: await adapter.bulkInsertRecords({ tableName, schemaName, records, db }),
		}),
		{ query: tableQuerySchema, body: bulkInsertRecordsSchema },
	);
