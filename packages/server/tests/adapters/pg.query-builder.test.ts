import { describe, expect, it } from "vitest";
import {
	buildCursorWhereClause,
	buildSortClause,
	buildWhereClause,
} from "@/adapters/pg/pg.query-builder.js";

describe("PostgreSQL query builder", () => {
	it("builds WHERE clauses with PostgreSQL placeholders and casts text operators", () => {
		const result = buildWhereClause([
			{ columnName: "status", operator: "=", value: "active" },
			{ columnName: "score", operator: ">", value: "90" },
			{ columnName: "score", operator: "<=", value: "100" },
			{ columnName: "name", operator: "ilike", value: "%sam%" },
			{ columnName: "nickname", operator: "not like", value: "%bot%" },
			{ columnName: "kind", operator: "is", value: "user" },
			{ columnName: "archived", operator: "is not", value: "true" },
			{ columnName: "deleted_at", operator: "is", value: "null" },
			{ columnName: "created_at", operator: "is not", value: "null" },
		]);

		expect(result.clause).toContain('"status" = $1');
		expect(result.clause).toContain('"score" > $2');
		expect(result.clause).toContain('"score" <= $3');
		expect(result.clause).toContain('"name"::text ILIKE $4');
		expect(result.clause).toContain('"nickname"::text NOT LIKE $5');
		expect(result.clause).toContain('"kind" = $6');
		expect(result.clause).toContain('"archived" != $7');
		expect(result.clause).toContain('"deleted_at" IS NULL');
		expect(result.clause).toContain('"created_at" IS NOT NULL');
		expect(result.values).toEqual(["active", "90", "100", "%sam%", "%bot%", "user", "true"]);
		expect(buildWhereClause([{ columnName: "x", operator: "unknown", value: "1" }]).clause).toBe("");
		expect(buildWhereClause([])).toEqual({ clause: "", values: [] });
	});

	it("builds ORDER BY clauses for array and string sorts", () => {
		expect(
			buildSortClause(
				[
					{ columnName: "created_at", direction: "desc" },
					{ columnName: "id", direction: "asc" },
				],
				"asc",
			),
		).toBe('ORDER BY "created_at" DESC, "id" ASC');

		expect(buildSortClause("name", "desc")).toBe('ORDER BY "name" DESC');
		expect(buildSortClause([], "asc")).toBe("");
		expect(buildSortClause("", "asc")).toBe("");
	});

	it("builds tuple cursor predicates with the correct placeholder offset", () => {
		const result = buildCursorWhereClause(
			{
				sortColumns: ["created_at", "id"],
				values: { created_at: "2026-01-01", id: 10 },
			},
			"asc",
			"asc",
			3,
		);

		expect(result.clause).toBe('(("created_at", "id") > ($3, $4))');
		expect(result.values).toEqual(["2026-01-01", 10]);
		expect(
			buildCursorWhereClause(
				{ sortColumns: ["id"], values: { id: 10 } },
				"desc",
				"asc",
				1,
			).clause,
		).toBe('(("id") < ($1))');
		expect(
			buildCursorWhereClause({ sortColumns: [], values: {} }, "asc", "asc", 1),
		).toEqual({ clause: "", values: [] });
	});
});
