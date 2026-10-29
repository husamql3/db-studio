/**
 * Failure modes:
 * - an identifier is quoted with the wrong character for the dialect, or a quote inside it
 *   is not doubled, so the statement breaks or names another table
 * - a single quote in a value ends the literal early (injection)
 * - a backslash is not doubled where string literals treat it as an escape (MySQL, ClickHouse)
 * - SQL Server text loses non-ASCII characters without the N prefix
 * - null, "", 0 and false collapse into each other
 * - booleans come out as TRUE/FALSE on an engine that has no boolean literal
 * - a JSON value is written as [object Object]
 * - a duplicate keeps a key the database generates, or a lone primary key that can never be
 *   reused, or drops a composite key part the user must keep
 * - a duplicate turns a NULL into "", which inserts an empty string instead of the default
 */
import { DATABASE_ENGINES, type SqlInsertDialect } from "@db-studio/shared/types";
import { describe, expect, it } from "vitest";
import { toDuplicateValues, toInsertStatement } from "./row-actions";

const dialect = (engine: "pg" | "mysql" | "mssql" | "oracle") =>
	DATABASE_ENGINES[engine].sqlInsert as SqlInsertDialect;

const col = (
	columnName: string,
	extra: { isPrimaryKey?: boolean; columnDefault?: string },
) => ({
	columnName,
	dataType: "text" as const,
	dataTypeLabel: "text" as const,
	isNullable: true,
	columnDefault: extra.columnDefault ?? null,
	isPrimaryKey: extra.isPrimaryKey ?? false,
	isForeignKey: false,
	referencedTable: null,
	referencedColumn: null,
	enumValues: null,
});

describe("toInsertStatement", () => {
	it("quotes identifiers per dialect and doubles quotes inside them", () => {
		const row = { 'a"b': 1 };
		expect(toInsertStatement({ tableName: 't"x', row, dialect: dialect("pg") })).toBe(
			'INSERT INTO "t""x" ("a""b") VALUES (1);',
		);
		expect(
			toInsertStatement({ tableName: "t`x", row: { "a`b": 1 }, dialect: dialect("mysql") }),
		).toBe("INSERT INTO `t``x` (`a``b`) VALUES (1);");
		expect(
			toInsertStatement({ tableName: "t]x", row: { "a]b": 1 }, dialect: dialect("mssql") }),
		).toBe("INSERT INTO [t]]x] ([a]]b]) VALUES (1);");
	});

	it("qualifies the table with its schema", () => {
		expect(
			toInsertStatement({
				tableName: "users",
				schemaName: "auth",
				row: { id: 1 },
				dialect: dialect("pg"),
			}),
		).toBe('INSERT INTO "auth"."users" ("id") VALUES (1);');
	});

	it("keeps null, empty string, zero and false apart", () => {
		const row = { a: null, b: "", c: 0, d: false };
		expect(toInsertStatement({ tableName: "t", row, dialect: dialect("pg") })).toBe(
			`INSERT INTO "t" ("a", "b", "c", "d") VALUES (NULL, '', 0, FALSE);`,
		);
		expect(toInsertStatement({ tableName: "t", row, dialect: dialect("oracle") })).toBe(
			`INSERT INTO "t" ("a", "b", "c", "d") VALUES (NULL, '', 0, 0);`,
		);
	});

	it("escapes quotes and backslashes in strings", () => {
		const row = { s: "it's C:\\x" };
		expect(toInsertStatement({ tableName: "t", row, dialect: dialect("pg") })).toBe(
			`INSERT INTO "t" ("s") VALUES ('it''s C:\\x');`,
		);
		expect(toInsertStatement({ tableName: "t", row, dialect: dialect("mysql") })).toBe(
			"INSERT INTO `t` (`s`) VALUES ('it''s C:\\\\x');",
		);
	});

	it("prefixes SQL Server strings with N and writes booleans as bits", () => {
		expect(
			toInsertStatement({
				tableName: "t",
				row: { s: "café", b: true },
				dialect: dialect("mssql"),
			}),
		).toBe("INSERT INTO [t] ([s], [b]) VALUES (N'café', 1);");
	});

	it("writes JSON values as JSON text", () => {
		expect(
			toInsertStatement({
				tableName: "t",
				row: { j: { a: [1, "x"] } },
				dialect: dialect("pg"),
			}),
		).toBe(`INSERT INTO "t" ("j") VALUES ('{"a":[1,"x"]}');`);
	});
});

describe("toDuplicateValues", () => {
	it("omits a lone primary key and generated defaults", () => {
		const cols = [
			col("code", { isPrimaryKey: true }),
			col("serial_no", { columnDefault: "nextval('s'::regclass)" }),
			col("name", {}),
		];
		expect(toDuplicateValues({ code: "A1", serial_no: 7, name: "x" }, cols)).toEqual({
			name: "x",
		});
	});

	it("keeps every part of a composite key", () => {
		const cols = [col("a", { isPrimaryKey: true }), col("b", { isPrimaryKey: true })];
		expect(toDuplicateValues({ a: 1, b: 2 }, cols)).toEqual({ a: "1", b: "2" });
	});

	it("leaves NULLs out so the column default applies, but keeps false and empty text", () => {
		const cols = [col("n", {}), col("f", {}), col("e", {})];
		expect(toDuplicateValues({ n: null, f: false, e: "" }, cols)).toEqual({
			f: "false",
			e: "",
		});
	});
});
