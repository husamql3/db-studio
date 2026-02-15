import { HTTPException } from "hono/http-exception";
import type { DatabaseSchemaType, ExecuteQueryParams, ExecuteQueryResult } from "shared/types";
import { getMongoDb } from "@/mongo-manager.js";
import { buildMongoSortForQuery, normalizeMongoDocument, toMongoId } from "./tables.dao.js";

type MongoQueryPayload = {
	collection: string;
	operation:
		| "find"
		| "aggregate"
		| "insertOne"
		| "insertMany"
		| "updateOne"
		| "updateMany"
		| "deleteOne"
		| "deleteMany"
		| "count";
	filter?: Record<string, unknown>;
	pipeline?: Record<string, unknown>[];
	document?: Record<string, unknown> | Record<string, unknown>[];
	update?: Record<string, unknown>;
	options?: Record<string, unknown>;
	sort?: Record<string, 1 | -1>;
	limit?: number;
	skip?: number;
};

const normalizeIdFilter = (filter: Record<string, unknown>) => {
	if (filter._id && typeof filter._id === "string") {
		return { ...filter, _id: toMongoId(filter._id) };
	}
	if (filter._id && typeof filter._id === "object") {
		const obj = filter._id as Record<string, unknown>;
		if (Array.isArray(obj.$in)) {
			return {
				...filter,
				_id: {
					...obj,
					$in: obj.$in.map((val) => (typeof val === "string" ? toMongoId(val) : val)),
				},
			};
		}
		if (Array.isArray(obj.$nin)) {
			return {
				...filter,
				_id: {
					...obj,
					$nin: obj.$nin.map((val) => (typeof val === "string" ? toMongoId(val) : val)),
				},
			};
		}
	}
	return filter;
};

export const executeMongoQuery = async ({
	query,
	db,
}: {
	query: ExecuteQueryParams["query"];
	db: DatabaseSchemaType["db"];
}): Promise<ExecuteQueryResult> => {
	if (!query || !query.trim()) {
		throw new HTTPException(400, {
			message: "Query is required",
		});
	}

	let payload: MongoQueryPayload;
	try {
		payload = JSON.parse(query) as MongoQueryPayload;
	} catch (error) {
		throw new HTTPException(400, {
			message: "Mongo query must be valid JSON",
		});
	}

	if (!payload.collection || !payload.operation) {
		throw new HTTPException(400, {
			message: "Mongo query must include collection and operation",
		});
	}

	const mongoDb = await getMongoDb(db);
	const collection = mongoDb.collection(payload.collection);

	const startTime = performance.now();
	let rows: Record<string, unknown>[] = [];
	let rowCount = 0;
	let message: string | undefined;

	switch (payload.operation) {
		case "find": {
			const filter = normalizeIdFilter(payload.filter ?? {});
			const cursor = collection.find(filter, payload.options ?? {});
			const sort = payload.sort ?? buildMongoSortForQuery("", undefined);
			cursor.sort(sort);
			if (payload.skip) cursor.skip(payload.skip);
			if (payload.limit) cursor.limit(payload.limit);
			rows = await cursor.toArray();
			rowCount = rows.length;
			break;
		}
		case "aggregate": {
			const pipeline = payload.pipeline ?? [];
			rows = await collection.aggregate(pipeline, payload.options ?? {}).toArray();
			rowCount = rows.length;
			break;
		}
		case "insertOne": {
			const doc = payload.document as Record<string, unknown> | undefined;
			if (!doc) throw new HTTPException(400, { message: "document is required" });
			const result = await collection.insertOne(doc);
			rowCount = result.insertedId ? 1 : 0;
			message = "OK";
			break;
		}
		case "insertMany": {
			const docs = payload.document as Record<string, unknown>[] | undefined;
			if (!Array.isArray(docs)) throw new HTTPException(400, { message: "document array is required" });
			const result = await collection.insertMany(docs);
			rowCount = result.insertedCount ?? 0;
			message = "OK";
			break;
		}
		case "updateOne": {
			const filter = normalizeIdFilter(payload.filter ?? {});
			if (!payload.update) throw new HTTPException(400, { message: "update is required" });
			const result = await collection.updateOne(filter, payload.update, payload.options ?? {});
			rowCount = result.matchedCount ?? 0;
			message = `OK (${result.modifiedCount ?? 0} modified)`;
			break;
		}
		case "updateMany": {
			const filter = normalizeIdFilter(payload.filter ?? {});
			if (!payload.update) throw new HTTPException(400, { message: "update is required" });
			const result = await collection.updateMany(filter, payload.update, payload.options ?? {});
			rowCount = result.matchedCount ?? 0;
			message = `OK (${result.modifiedCount ?? 0} modified)`;
			break;
		}
		case "deleteOne": {
			const filter = normalizeIdFilter(payload.filter ?? {});
			const result = await collection.deleteOne(filter, payload.options ?? {});
			rowCount = result.deletedCount ?? 0;
			message = "OK";
			break;
		}
		case "deleteMany": {
			const filter = normalizeIdFilter(payload.filter ?? {});
			const result = await collection.deleteMany(filter, payload.options ?? {});
			rowCount = result.deletedCount ?? 0;
			message = "OK";
			break;
		}
		case "count": {
			const filter = normalizeIdFilter(payload.filter ?? {});
			rowCount = await collection.countDocuments(filter);
			rows = [{ count: rowCount }];
			message = "OK";
			break;
		}
		default:
			throw new HTTPException(400, { message: "Unsupported Mongo operation" });
	}

	const duration = performance.now() - startTime;

	const normalizedRows = rows.map((row) => normalizeMongoDocument(row) as Record<string, unknown>);

	const columns = normalizedRows[0] ? Object.keys(normalizedRows[0]) : [];
	return {
		columns,
		rows: normalizedRows,
		rowCount,
		duration,
		message,
	};
};
