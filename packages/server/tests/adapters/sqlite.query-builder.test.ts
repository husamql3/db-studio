import type { FilterType } from "@db-studio/shared/types";
import { createClient } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFilterConditions, createBinds, whereSql } from "@/adapters/sql-filters.js";
import {
	hasMultipleStatements,
	isTransactionControl,
	sqliteFilters,
} from "@/adapters/sqlite/sqlite.query-builder.js";

// Failure modes for the grid's filters, each run against a real in-memory SQLite:
// - a comparison operator is written as a different one (`>` as `>=`), so a boundary row
//   is kept or lost
// - two filters are joined with OR, or the second is dropped
// - `is null` (in any case) binds the string "null" instead of testing IS NULL
// - NOT is lost from NOT LIKE / NOT ILIKE
// - LIKE on a number column finds nothing
// - an unknown operator filters out every row instead of being ignored
// - a value containing a quote is spliced into the SQL instead of bound
const client = createClient({ url: ":memory:" });

beforeAll(async () => {
	await client.batch(
		[
			"CREATE TABLE people (id INTEGER PRIMARY KEY, name TEXT, age INTEGER, deleted_at TEXT)",
			"INSERT INTO people VALUES (1, 'Ada', 18, NULL), (2, 'bob', 30, '2024-01-01'), (3, 'ADAM', 45, NULL), (4, 'O''Brien', 18, '2024-02-01')",
		],
		"write",
	);
});

afterAll(() => client.close());

const matching = async (filters: FilterType[]) => {
	const { values, bind } = createBinds(() => "?");
	const where = whereSql(buildFilterConditions(filters, bind, sqliteFilters));

	const { rows } = await client.execute({
		sql: `SELECT id FROM people ${where} ORDER BY id`,
		args: values as string[],
	});

	return rows.map((row) => Number(row.id));
};

describe("sqlite filters", () => {
	it("keeps every row without filters", async () => {
		expect(await matching([])).toEqual([1, 2, 3, 4]);
	});

	it.each([
		["=", [1, 4]],
		["!=", [2, 3]],
		[">", [2, 3]],
		[">=", [1, 2, 3, 4]],
		["<", []],
		["<=", [1, 4]],
	] as const)("compares with %s", async (operator, ids) => {
		expect(await matching([{ columnName: "age", operator, value: "18" }])).toEqual(ids);
	});

	it("requires every filter to match", async () => {
		expect(
			await matching([
				{ columnName: "age", operator: ">", value: "20" },
				{ columnName: "name", operator: "!=", value: "bob" },
			]),
		).toEqual([3]);
	});

	it("tests NULL with is / is not null, and equality otherwise", async () => {
		expect(
			await matching([{ columnName: "deleted_at", operator: "is", value: "NULL" }]),
		).toEqual([1, 3]);
		expect(
			await matching([{ columnName: "deleted_at", operator: "is not", value: "null" }]),
		).toEqual([2, 4]);
		expect(await matching([{ columnName: "name", operator: "is", value: "bob" }])).toEqual([
			2,
		]);
		expect(await matching([{ columnName: "name", operator: "is not", value: "bob" }])).toEqual(
			[1, 3, 4],
		);
	});

	// SQLite's LIKE already ignores ASCII case, so LIKE and ILIKE match the same rows.
	it("matches LIKE and ILIKE without regard to case, and negates NOT LIKE", async () => {
		expect(await matching([{ columnName: "name", operator: "like", value: "Ad%" }])).toEqual([
			1, 3,
		]);
		expect(await matching([{ columnName: "name", operator: "ilike", value: "ad%" }])).toEqual([
			1, 3,
		]);
		expect(
			await matching([{ columnName: "name", operator: "not ilike", value: "ad%" }]),
		).toEqual([2, 4]);
		expect(
			await matching([{ columnName: "name", operator: "not like", value: "Ad%" }]),
		).toEqual([2, 4]);
	});

	it("matches LIKE against a number column as text", async () => {
		expect(await matching([{ columnName: "age", operator: "like", value: "4%" }])).toEqual([
			3,
		]);
	});

	it("binds a value holding a quote", async () => {
		expect(await matching([{ columnName: "name", operator: "=", value: "O'Brien" }])).toEqual([
			4,
		]);
	});

	it("ignores an unknown operator", async () => {
		const unknown = "unknown" as FilterType["operator"];
		expect(await matching([{ columnName: "age", operator: unknown, value: "1" }])).toEqual([
			1, 2, 3, 4,
		]);
	});
});

// Failure modes for detecting a second statement in a query-runner input:
// - a semicolon inside a string literal ('a;b') or quoted identifier ("a;b", `a;b`, [a;b]) counts as a split
// - a semicolon inside a -- line comment or /* block comment */ counts as a split
// - trailing semicolons, whitespace or comments after the only statement count as a second statement
// - an escaped quote ('it''s; fine') ends the string early and exposes the semicolon
// - a real second statement after a comment or string is missed
// - semicolons inside a CREATE TRIGGER ... BEGIN ... END body (including CASE ... END) count as splits
// - a statement after a trigger's closing END is missed
describe("sqlite.query-builder — hasMultipleStatements", () => {
	it.each([
		"SELECT 1",
		"SELECT 1;",
		"SELECT 1;;  \n",
		"SELECT 1; -- trailing note",
		"SELECT 1; /* done */",
		"SELECT 'a;b'",
		"SELECT 'it''s; fine'",
		`SELECT "a;b" FROM t`,
		"SELECT `a;b` FROM t",
		"SELECT [a;b] FROM t",
		"SELECT 1 -- x; DROP TABLE t\n",
		"SELECT 1 /* x; DROP TABLE t */",
		"CREATE TRIGGER trg AFTER INSERT ON a BEGIN INSERT INTO b VALUES (1); END;",
		"create temp trigger trg after update on a begin update b set x = case when new.y then 1 else 0 end; delete from c; end",
		"/* note */ CREATE TRIGGER trg AFTER INSERT ON a BEGIN SELECT 'end;'; END;",
	])("treats %j as one statement", (sql) => {
		expect(hasMultipleStatements(sql)).toBe(false);
	});

	it.each([
		"SELECT 1; SELECT 2",
		"BEGIN; INSERT INTO t VALUES (1); COMMIT;",
		"SELECT 'a;b'; DELETE FROM t",
		"SELECT 1 /* c */; SELECT 2",
		"SELECT 1; -- note\nSELECT 2",
		"CREATE TRIGGER trg AFTER INSERT ON a BEGIN INSERT INTO b VALUES (1); END; SELECT 1",
		"BEGIN; CREATE TRIGGER trg AFTER INSERT ON a BEGIN SELECT 1; END;",
		// a table named "trigger" is not a trigger body, so its `;` still ends the statement
		"CREATE TABLE trigger (begin int); DROP TABLE users",
	])("detects a second statement in %j", (sql) => {
		expect(hasMultipleStatements(sql)).toBe(true);
	});
});

// Failure modes for spotting a statement that only controls a transaction:
// - a leading comment hides BEGIN/COMMIT/ROLLBACK from the check
// - a comment after the transaction's semicolon hides it from the check
// - lowercase or extra whitespace variants slip through
// - an ordinary statement that merely starts with a similar word (BEGINNING, ENDPOINT) is rejected
// - CREATE TRIGGER ... BEGIN is mistaken for a transaction
describe("sqlite.query-builder — isTransactionControl", () => {
	it.each([
		"BEGIN",
		"begin transaction",
		"/* note */ BEGIN",
		"BEGIN; -- trailing comment",
		"COMMIT; /* trailing comment */",
		"-- start\nBEGIN IMMEDIATE",
		"  START   TRANSACTION",
		"COMMIT",
		"end",
		"ROLLBACK TO sp1",
		"SAVEPOINT sp1",
		"release sp1",
	])("rejects %j", (sql) => {
		expect(isTransactionControl(sql)).toBe(true);
	});

	it.each([
		"SELECT 1 AS endless",
		"SELECT * FROM beginning",
		"CREATE TRIGGER trg AFTER INSERT ON a BEGIN SELECT 1; END",
		"UPDATE endpoints SET x = 1",
	])("allows %j", (sql) => {
		expect(isTransactionControl(sql)).toBe(false);
	});
});
