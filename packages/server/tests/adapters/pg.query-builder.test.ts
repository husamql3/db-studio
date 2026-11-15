import type { FilterType } from "@db-studio/shared/types";
import { describe, expect, it } from "vitest";
import { pgFilters, pgKeyset, pgPlaceholder } from "@/adapters/pg/pg.query-builder.js";
import { buildFilterConditions, createBinds, whereSql } from "@/adapters/sql-filters.js";
import { keysetOrderBy, keysetPredicate, type OrderTerm } from "@/adapters/sql-pagination.js";

const buildWhereClause = (filters: FilterType[]) => {
	const { values, bind } = createBinds(pgPlaceholder);

	return { clause: whereSql(buildFilterConditions(filters, bind, pgFilters)), values };
};

const buildOrderBy = (terms: OrderTerm[], backward = false) =>
	keysetOrderBy(terms, backward, pgKeyset);

const buildKeysetPredicate = (terms: OrderTerm[], cursor: Record<string, unknown>) => {
	const { values, bind } = createBinds(pgPlaceholder);

	return { clause: keysetPredicate(terms, cursor, false, bind, pgKeyset), values };
};

// Keyset paging itself runs against a real engine in duckdb.query-builder.test.ts, whose
// dialect writes NULL placement the same way.
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
			buildKeysetPredicate([{ column: name, direction: "asc" }], { [name]: 1 }).clause,
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
		expect(
			buildWhereClause([{ columnName: "x", operator: "unknown", value: "1" }]).clause,
		).toBe("");
		expect(buildWhereClause([])).toEqual({ clause: "", values: [] });
	});
});
