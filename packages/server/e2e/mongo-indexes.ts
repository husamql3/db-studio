import assert from "node:assert/strict";
import { type IndexInfoSchemaType, indexInfoSchema } from "@db-studio/shared/types";
import { z } from "zod";
import {
	checks,
	inProcessApp,
	normalize as normalizeJson,
	requireDatabaseUrl,
	writeArtifact,
} from "./lib.js";

const app = await inProcessApp(requireDatabaseUrl("mongodb").url);
const { connector } = await import("../src/open-connections.js");
const { db } = app;
const collection = "dbstudio_e2e_indexes";
const missingCollection = "dbstudio_e2e_indexes_missing";
const evidence: Record<string, unknown> = {};
const listSchema = z.object({ data: z.array(indexInfoSchema) });
const { report, finish } = checks();

// A failed index build names the build and the collection by UUID.
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const normalize = (value: unknown) =>
	normalizeJson(value, {
		keys: ["requestId"],
		replace: [
			[UUID, "<uuid>"],
			[`${db}.`, "<db>."],
		],
	});

const request = async (name: string, method: string, path: string, body?: unknown) => {
	const result = await app.call(method, `/tables/${path}`, body);
	evidence[name] = { status: result.status, body: normalize(result.body) };

	return result;
};

const list = async (name: string, target = collection): Promise<IndexInfoSchemaType[]> => {
	const { status, body } = await request(name, "GET", `${target}/indexes`);
	assert.equal(status, 200, JSON.stringify(body));

	return listSchema.parse(body).data;
};

const create = (name: string, body: unknown, target = collection) =>
	request(name, "POST", `${target}/indexes`, body);

const drop = (name: string, indexName: string) =>
	request(name, "DELETE", `${collection}/indexes/${encodeURIComponent(indexName)}`);

const step = async (name: string, run: () => Promise<void>) => {
	try {
		await run();
		report(name);
	} catch (error) {
		report(name, error instanceof Error ? error.message : String(error));
	}
};

const mongoDb = await connector("mongodb").db(db);

let artifactPath: string | undefined;

try {
	await mongoDb.collection(collection).drop();
	await mongoDb.collection(missingCollection).drop();
	await mongoDb.createCollection(collection);
	await mongoDb.collection(collection).insertMany([
		{ email: "a@example.com", status: "active", address: { city: "Berlin" } },
		{ email: "b@example.com", status: "active", address: { city: "Tokyo" } },
	]);

	await step("fresh collection lists only _id_ as primary", async () => {
		assert.deepEqual(await list("list fresh"), [
			{
				indexName: "_id_",
				columns: ["_id"],
				isUnique: true,
				method: null,
				kind: "primary",
				definition: null,
			},
		]);
	});

	await step("compound index keeps the given field order", async () => {
		const { status } = await create("create compound", {
			indexName: "e2e_status_email_idx",
			columns: ["status", "email"],
			isUnique: false,
		});

		assert.equal(status, 200);

		const index = (await list("list after compound")).find(
			(candidate) => candidate.indexName === "e2e_status_email_idx",
		);

		assert.deepEqual(index, {
			indexName: "e2e_status_email_idx",
			columns: ["status", "email"],
			isUnique: false,
			method: null,
			kind: "index",
			definition: null,
		});
	});

	await step("nested-path unique index lists as unique", async () => {
		const { status } = await create("create nested unique", {
			indexName: "e2e_city_uidx",
			columns: ["address.city"],
			isUnique: true,
		});

		assert.equal(status, 200);

		const index = (await list("list after nested unique")).find(
			(candidate) => candidate.indexName === "e2e_city_uidx",
		);

		assert.deepEqual(index?.columns, ["address.city"]);
		assert.equal(index?.isUnique, true);
		assert.equal(index?.kind, "index");
	});

	await step("duplicate index name is 409", async () => {
		// Same name and same spec: MongoDB itself would answer ok.
		const identical = await create("create identical", {
			indexName: "e2e_status_email_idx",
			columns: ["status", "email"],
			isUnique: false,
		});

		assert.equal(identical.status, 409);

		const sameName = await create("create same name other fields", {
			indexName: "e2e_status_email_idx",
			columns: ["email"],
			isUnique: false,
		});

		assert.equal(sameName.status, 409);
	});

	await step("unique index over colliding documents is 409", async () => {
		const { status } = await create("create unique over duplicates", {
			indexName: "e2e_status_uidx",
			columns: ["status"],
			isUnique: true,
		});

		assert.equal(status, 409);
		const names = (await list("list after failed unique")).map((index) => index.indexName);
		assert.ok(!names.includes("e2e_status_uidx"));
	});

	await step("create with a method is 400", async () => {
		const { status } = await create("create with method", {
			indexName: "e2e_method_idx",
			columns: ["email"],
			isUnique: false,
			method: "btree",
		});

		assert.equal(status, 400);
	});

	await step("invalid field paths are 400", async () => {
		for (const [name, path] of [
			["create operator field", "$bad"],
			["create empty segment", "a..b"],
			["create nested operator segment", "address.$city"],
		]) {
			const { status } = await create(name, {
				indexName: "e2e_bad_idx",
				columns: [path],
				isUnique: false,
			});

			assert.equal(status, 400, path);
		}

		const names = (await list("list after invalid paths")).map((index) => index.indexName);
		assert.ok(!names.includes("e2e_bad_idx"));
	});

	await step("dropping _id_ is 400", async () => {
		const { status } = await drop("drop _id_", "_id_");
		assert.equal(status, 400);
	});

	await step("drop removes the index", async () => {
		const { status } = await drop("drop compound", "e2e_status_email_idx");
		assert.equal(status, 200);
		const names = (await list("list after drop")).map((index) => index.indexName);
		assert.deepEqual(names, ["_id_", "e2e_city_uidx"]);
	});

	await step("dropping a missing index is 404", async () => {
		const { status } = await drop("drop missing", "e2e_status_email_idx");
		assert.equal(status, 404);
	});

	await step("missing collection is 404", async () => {
		const listed = await request(
			"list missing collection",
			"GET",
			`${missingCollection}/indexes`,
		);

		assert.equal(listed.status, 404);

		const created = await create(
			"create on missing collection",
			{ indexName: "e2e_missing_idx", columns: ["email"], isUnique: false },
			missingCollection,
		);

		assert.equal(created.status, 404);
		// createIndex would otherwise create the collection implicitly.
		const collections = await mongoDb.listCollections({ name: missingCollection }).toArray();
		assert.equal(collections.length, 0);
	});

	await step(
		"driver-created sparse, TTL and descending indexes retain badge metadata and definitions",
		async () => {
			await mongoDb
				.collection(collection)
				.createIndex(
					{ expires_at: 1 },
					{ name: "e2e_ttl_sparse_idx", sparse: true, expireAfterSeconds: 0 },
				);
			await mongoDb
				.collection(collection)
				.createIndex({ status: 1, created_at: -1 }, { name: "e2e_desc_idx" });
			const indexes = await list("list driver-created");
			const byName = (name: string) => indexes.find((index) => index.indexName === name);
			assert.deepEqual(byName("e2e_ttl_sparse_idx"), {
				indexName: "e2e_ttl_sparse_idx",
				isSparse: true,
				expireAfterSeconds: 0,
				columns: ["expires_at"],
				isUnique: false,
				method: null,
				kind: "index",
				definition: '{"key":{"expires_at":1},"sparse":true,"expireAfterSeconds":0}',
			});
			assert.deepEqual(byName("e2e_desc_idx"), {
				indexName: "e2e_desc_idx",
				columns: ["status", "created_at"],
				isUnique: false,
				method: null,
				kind: "index",
				definition: '{"key":{"status":1,"created_at":-1}}',
			});
		},
	);

	await step("seeded collections list their indexes", async () => {
		const seeded: Record<string, unknown> = {};

		for (const name of ["contributors", "projects", "contributions"]) {
			const { status, body } = await app.call("GET", `/tables/${name}/indexes`);

			// An unseeded database is still a valid target; record the absence.
			if (status === 404) {
				seeded[name] = null;
				continue;
			}

			assert.equal(status, 200, JSON.stringify(body));
			seeded[name] = normalize(listSchema.parse(body).data);
		}

		evidence["seeded collections"] = seeded;
	});
} finally {
	artifactPath = await writeArtifact("mongo-indexes.json", evidence);
	await mongoDb.collection(collection).drop();
	await app.close();
}

finish(artifactPath);
