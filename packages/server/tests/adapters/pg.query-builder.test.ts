import { describe, expect, it } from "vitest";
import {
	buildKeysetPredicate,
	buildOrderBy,
	buildWhereClause,
} from "@/adapters/pg/pg.query-builder.js";

// Keyset paging failure modes: a NULL sort value ends paging early (a row-value comparison
// never matches NULL), mixed sort directions skip rows, a backward page reads the wrong side,
// and a parameter number collides with the filter parameters before it.

describe("PostgreSQL query builder", () => {
	it("keeps a column name containing quotes inside its identifier (GHSA-vw88-9x6f-fcp5)", () => {
		const name = 'id" = CAST((SELECT note FROM secrets) AS int) OR "id';
		const escaped = '"id"" = CAST((SELECT note FROM secrets) AS int) OR ""id"';
		expect(buildWhereClause([{ columnName: name, operator: "=", value: "1" }]).clause).toBe(
			`WHERE ${escaped} = $1`,
		);
		expect(buildOrderBy([{ column: name, direction: "asc" }])).toBe(
			`ORDER BY ${escaped} ASC NULLS LAST`,
		);
		expect(
			buildKeysetPredicate([{ column: name, direction: "asc" }], { [name]: 1 }, false, 1).clause,
		).toBe(`(((${escaped} > $1 OR ${escaped} IS NULL)))`);
	});

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

	it("orders each column in its own direction with NULLs last, reversed for a backward page", () => {
		const terms = [
			{ column: "created_at", direction: "desc" as const },
			{ column: "id", direction: "asc" as const },
		];
		expect(buildOrderBy(terms)).toBe('ORDER BY "created_at" DESC NULLS LAST, "id" ASC NULLS LAST');
		expect(buildOrderBy(terms, true)).toBe(
			'ORDER BY "created_at" ASC NULLS FIRST, "id" DESC NULLS FIRST',
		);
	});

	it("continues past a mixed-direction cursor, numbering parameters after the filters", () => {
		const result = buildKeysetPredicate(
			[
				{ column: "created_at", direction: "desc" },
				{ column: "id", direction: "asc" },
			],
			{ created_at: "2026-01-01", id: 10 },
			false,
			3,
		);
		expect(result.clause).toBe(
			'((("created_at" < $3 OR "created_at" IS NULL)) OR ("created_at" = $3 AND ("id" > $4 OR "id" IS NULL)))',
		);
		expect(result.values).toEqual(["2026-01-01", 10]);
	});

	it("continues past a cursor whose sort value is NULL, in both directions", () => {
		const terms = [
			{ column: "label", direction: "asc" as const },
			{ column: "id", direction: "asc" as const },
		];
		const cursor = { label: null, id: 2 };
		expect(buildKeysetPredicate(terms, cursor, false, 1)).toEqual({
			clause: '(("label" IS NULL AND ("id" > $1 OR "id" IS NULL)))',
			values: [2],
		});
		expect(buildKeysetPredicate(terms, cursor, true, 1)).toEqual({
			clause: '((("label" IS NOT NULL)) OR ("label" IS NULL AND ("id" < $1)))',
			values: [2],
		});
	});
});
