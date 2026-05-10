import { describe, expect, it } from "vitest";
import {
	buildCursorWhereClause,
	buildSortClause,
	buildWhereClause,
} from "@/adapters/sqlite/sqlite.query-builder.js";

describe("sqlite.query-builder — buildWhereClause", () => {
	it("returns empty clause for empty filter list", () => {
		const result = buildWhereClause([]);
		expect(result.clause).toBe("");
		expect(result.values).toEqual([]);
	});

	it("builds equality filter with ? placeholder", () => {
		const { clause, values } = buildWhereClause([
			{ columnName: "status", operator: "=", value: "active" },
		]);
		expect(clause).toBe(`WHERE "status" = ?`);
		expect(values).toEqual(["active"]);
	});

	it("builds multiple filters joined by AND", () => {
		const { clause, values } = buildWhereClause([
			{ columnName: "age", operator: ">", value: "18" },
			{ columnName: "name", operator: "!=", value: "bot" },
		]);
		expect(clause).toContain(`"age" > ?`);
		expect(clause).toContain(`"name" != ?`);
		expect(clause).toContain("AND");
		expect(values).toEqual(["18", "bot"]);
	});

	it("handles IS NULL operator", () => {
		const { clause, values } = buildWhereClause([
			{ columnName: "deleted_at", operator: "is", value: "null" },
		]);
		expect(clause).toBe(`WHERE "deleted_at" IS NULL`);
		expect(values).toEqual([]);
	});

	it("handles IS NOT NULL operator", () => {
		const { clause, values } = buildWhereClause([
			{ columnName: "email", operator: "is not", value: "null" },
		]);
		expect(clause).toBe(`WHERE "email" IS NOT NULL`);
		expect(values).toEqual([]);
	});

	it("handles LIKE operator", () => {
		const { clause, values } = buildWhereClause([
			{ columnName: "name", operator: "like", value: "%ada%" },
		]);
		expect(clause).toContain("LIKE ?");
		expect(values).toEqual(["%ada%"]);
	});

	it("handles NOT LIKE operator", () => {
		const { clause, values } = buildWhereClause([
			{ columnName: "name", operator: "not like", value: "%bot%" },
		]);
		expect(clause).toContain("NOT LIKE ?");
		expect(values).toEqual(["%bot%"]);
	});

	it("handles ILIKE operator using COLLATE NOCASE", () => {
		const { clause, values } = buildWhereClause([
			{ columnName: "name", operator: "ilike", value: "%Ada%" },
		]);
		expect(clause).toContain("LIKE ?");
		expect(clause).toContain("COLLATE NOCASE");
		expect(values).toEqual(["%Ada%"]);
	});

	it("handles NOT ILIKE operator", () => {
		const { clause, values } = buildWhereClause([
			{ columnName: "name", operator: "not ilike", value: "%bot%" },
		]);
		expect(clause).toContain("NOT LIKE ?");
		expect(clause).toContain("COLLATE NOCASE");
		expect(values).toEqual(["%bot%"]);
	});

	it("handles all comparison operators", () => {
		for (const op of [">=", "<=", "<", ">"] as const) {
			const { clause, values } = buildWhereClause([
				{ columnName: "count", operator: op, value: "5" },
			]);
			expect(clause).toContain(op);
			expect(values).toEqual(["5"]);
		}
	});

	it("ignores unknown operators and returns empty", () => {
		// biome-ignore lint/suspicious/noExplicitAny: testing unknown operator path
		const { clause, values } = buildWhereClause([{ columnName: "x", operator: "unknown" as any, value: "v" }]);
		expect(clause).toBe("");
		expect(values).toEqual([]);
	});

	it("handles non-null IS value as equality", () => {
		const { clause, values } = buildWhereClause([
			{ columnName: "status", operator: "is", value: "active" },
		]);
		expect(clause).toContain(`"status" = ?`);
		expect(values).toEqual(["active"]);
	});
});

describe("sqlite.query-builder — buildSortClause", () => {
	it("returns empty string for empty sorts array", () => {
		expect(buildSortClause([], "asc")).toBe("");
	});

	it("returns empty string for empty string sort", () => {
		expect(buildSortClause("", "asc")).toBe("");
	});

	it("builds ORDER BY from array of sorts", () => {
		const clause = buildSortClause(
			[
				{ columnName: "name", direction: "asc" },
				{ columnName: "age", direction: "desc" },
			],
			"asc",
		);
		expect(clause).toBe(`ORDER BY "name" ASC, "age" DESC`);
	});

	it("builds ORDER BY from string sort column", () => {
		const clause = buildSortClause("id", "asc");
		expect(clause).toBe(`ORDER BY "id" ASC`);
	});

	it("respects desc order for string sort", () => {
		const clause = buildSortClause("created_at", "desc");
		expect(clause).toBe(`ORDER BY "created_at" DESC`);
	});
});

describe("sqlite.query-builder — buildCursorWhereClause", () => {
	it("returns empty clause when sortColumns is empty", () => {
		const { clause, values } = buildCursorWhereClause(
			{ values: {}, sortColumns: [] },
			"asc",
			"asc",
		);
		expect(clause).toBe("");
		expect(values).toEqual([]);
	});

	it("uses > operator for asc sort + asc direction (forward)", () => {
		const { clause, values } = buildCursorWhereClause(
			{ values: { id: 5 }, sortColumns: ["id"] },
			"asc",
			"asc",
		);
		expect(clause).toBe(`("id") > (?)`);
		expect(values).toEqual([5]);
	});

	it("uses < operator for asc sort + desc direction (backward)", () => {
		const { clause, values } = buildCursorWhereClause(
			{ values: { id: 5 }, sortColumns: ["id"] },
			"desc",
			"asc",
		);
		expect(clause).toBe(`("id") < (?)`);
		expect(values).toEqual([5]);
	});

	it("uses < operator for desc sort + asc direction", () => {
		const { clause, values } = buildCursorWhereClause(
			{ values: { id: 5 }, sortColumns: ["id"] },
			"asc",
			"desc",
		);
		expect(clause).toBe(`("id") < (?)`);
		expect(values).toEqual([5]);
	});

	it("uses > operator for desc sort + desc direction (forward backward paging)", () => {
		const { clause, values } = buildCursorWhereClause(
			{ values: { id: 5 }, sortColumns: ["id"] },
			"desc",
			"desc",
		);
		expect(clause).toBe(`("id") > (?)`);
		expect(values).toEqual([5]);
	});

	it("handles composite cursor columns", () => {
		const { clause, values } = buildCursorWhereClause(
			{ values: { name: "Ada", id: 1 }, sortColumns: ["name", "id"] },
			"asc",
			"asc",
		);
		expect(clause).toBe(`("name", "id") > (?, ?)`);
		expect(values).toEqual(["Ada", 1]);
	});
});
