import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db-manager.js", () => ({
	isValidObjectId: vi.fn((value: unknown) => value === "507f1f77bcf86cd799439011"),
	coerceObjectId: vi.fn((value: unknown) => ({ objectId: value })),
}));

import {
	buildMatchStage,
	buildSortStage,
	decodeMongoCursor,
	encodeMongoCursor,
} from "@/adapters/mongo/mongo.pipeline-builder.js";

describe("Mongo pipeline builder", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("builds $match conditions for comparison, regex, null, and ObjectId values", () => {
		const result = buildMatchStage([
			{ columnName: "age", operator: ">=", value: "18" },
			{ columnName: "age", operator: "<", value: "65" },
			{ columnName: "score", operator: "<=", value: "99" },
			{ columnName: "active", operator: "!=", value: "false" },
			{ columnName: "name", operator: "ilike", value: "A.B" },
			{ columnName: "nick", operator: "like", value: "A*" },
			{ columnName: "bot", operator: "not like", value: "B+" },
			{ columnName: "hidden", operator: "not ilike", value: "C?" },
			{ columnName: "deletedAt", operator: "is", value: "null" },
			{ columnName: "archivedAt", operator: "is not", value: "null" },
			{ columnName: "_id", operator: "=", value: "507f1f77bcf86cd799439011" },
			{ columnName: "", operator: "=", value: "ignored" },
			{ columnName: "fallback", operator: "unknown", value: "true" },
		]);

		expect(result).toEqual({
			$and: [
				{ age: { $gte: 18 } },
				{ age: { $lt: 65 } },
				{ score: { $lte: 99 } },
				{ active: { $ne: false } },
				{ name: { $regex: "A\\.B", $options: "i" } },
				{ nick: { $regex: "A\\*", $options: "" } },
				{ bot: { $not: { $regex: "B\\+", $options: "" } } },
				{ hidden: { $not: { $regex: "C\\?", $options: "i" } } },
				{ deletedAt: null },
				{ archivedAt: { $ne: null } },
				{ _id: { objectId: "507f1f77bcf86cd799439011" } },
				{ fallback: true },
			],
		});
		expect(buildMatchStage([])).toEqual({});
	});

	it("builds sort stages and defaults to _id ascending", () => {
		expect(buildSortStage(undefined)).toEqual({ _id: 1 });
		expect(buildSortStage([])).toEqual({ _id: 1 });
		expect(buildSortStage("")).toEqual({ _id: 1 });
		expect(buildSortStage("createdAt", "desc")).toEqual({ createdAt: -1 });
		expect(
			buildSortStage([
				{ columnName: "score", direction: "desc" },
				{ columnName: "name", direction: "asc" },
			]),
		).toEqual({ score: -1, name: 1 });
	});

	it("encodes and decodes skip offsets", () => {
		const cursor = encodeMongoCursor(150);
		expect(decodeMongoCursor(cursor)).toBe(150);
		expect(decodeMongoCursor("not-json")).toBe(0);
		expect(decodeMongoCursor()).toBe(0);
	});
});
