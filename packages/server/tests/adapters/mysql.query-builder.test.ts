import type { FilterType } from "@db-studio/shared/types";
import { describe, expect, it } from "vitest";
import {
	buildMysqlColumnDefinition,
	formatMysqlDefaultValue,
	mapColumnTypeToMysql,
	mysqlFilters,
	quoteMysqlIdent,
} from "@/adapters/mysql/mysql.query-builder.js";
import { buildFilterConditions, createBinds, whereSql } from "@/adapters/sql-filters.js";

const buildWhereClause = (filters: FilterType[]) => {
	const { values, bind } = createBinds(() => "?");

	return { clause: whereSql(buildFilterConditions(filters, bind, mysqlFilters)), values };
};

describe("MySQL query builder", () => {
	// An unescaped backtick in a name would end the identifier and let the rest run as SQL.
	it("escapes backticks in identifiers by doubling them", () => {
		expect(quoteMysqlIdent("we`ird")).toBe("`we``ird`");
	});

	it("builds WHERE clauses with backtick identifiers and ? placeholders", () => {
		const result = buildWhereClause([
			{ columnName: "status", operator: "!=", value: "archived" },
			{ columnName: "age", operator: "<", value: "50" },
			{ columnName: "age", operator: ">=", value: "18" },
			{ columnName: "name", operator: "like", value: "%ada%" },
			{ columnName: "name", operator: "not ilike", value: "%bot%" },
			{ columnName: "kind", operator: "is", value: "user" },
			{ columnName: "archived", operator: "is not", value: "true" },
			{ columnName: "deleted_at", operator: "is not", value: "null" },
		]);

		expect(result.clause).toContain("`status` != ?");
		expect(result.clause).toContain("`age` < ?");
		expect(result.clause).toContain("`age` >= ?");
		expect(result.clause).toContain("`name` LIKE ?");
		expect(result.clause).toContain("`name` NOT LIKE ?");
		expect(result.clause).toContain("`kind` = ?");
		expect(result.clause).toContain("`archived` != ?");
		expect(result.clause).toContain("`deleted_at` IS NOT NULL");
		expect(result.values).toEqual(["archived", "50", "18", "%ada%", "%bot%", "user", "true"]);
		expect(
			buildWhereClause([{ columnName: "x", operator: "unknown", value: "1" }]).clause,
		).toBe("");
		expect(buildWhereClause([])).toEqual({ clause: "", values: [] });
	});

	it("maps portable column definitions to MySQL syntax", () => {
		expect(mapColumnTypeToMysql("serial", false)).toBe("INT AUTO_INCREMENT");
		expect(mapColumnTypeToMysql("bigserial", false)).toBe("BIGINT AUTO_INCREMENT");
		expect(mapColumnTypeToMysql("int2", false)).toBe("SMALLINT");
		expect(mapColumnTypeToMysql("double precision", false)).toBe("DOUBLE");
		expect(mapColumnTypeToMysql("boolean", false)).toBe("TINYINT(1)");
		expect(mapColumnTypeToMysql("uuid", false)).toBe("CHAR(36)");
		expect(mapColumnTypeToMysql("jsonb", false)).toBe("JSON");
		expect(mapColumnTypeToMysql("bytea", false)).toBe("LONGBLOB");
		expect(mapColumnTypeToMysql("point", false)).toBe("POINT");
		expect(mapColumnTypeToMysql("custom_type", false)).toBe("CUSTOM_TYPE");
		expect(mapColumnTypeToMysql("text", true)).toBe("JSON");
		expect(formatMysqlDefaultValue(undefined, "INT")).toBeNull();
		expect(formatMysqlDefaultValue("uuid()", "INT")).toBeNull();
		expect(formatMysqlDefaultValue("uuid()", "CHAR(36)")).toBe("(UUID())");
		expect(formatMysqlDefaultValue("now()", "DATETIME")).toBe("(CURRENT_TIMESTAMP)");
		expect(formatMysqlDefaultValue("current_date()", "DATE")).toBe("(CURRENT_DATE)");
		expect(formatMysqlDefaultValue("concat('a','b')", "TEXT")).toBe("(concat('a','b'))");
		expect(formatMysqlDefaultValue("null", "TEXT")).toBe("NULL");
		expect(formatMysqlDefaultValue("true", "BOOLEAN")).toBe("1");
		expect(formatMysqlDefaultValue("false", "BOOLEAN")).toBe("0");
		expect(
			buildMysqlColumnDefinition(
				{
					columnName: "email",
					columnType: "varchar",
					isNullable: false,
					isUnique: true,
					defaultValue: "'n/a'",
				},
				{ inlineKey: false, inlineUnique: true },
			),
		).toBe("`email` VARCHAR(255) NOT NULL DEFAULT 'n/a' UNIQUE");
		expect(
			buildMysqlColumnDefinition(
				{
					columnName: "id",
					columnType: "int",
					isPrimaryKey: true,
					isIdentity: true,
				},
				{ inlineKey: true, inlineUnique: false },
				true,
			),
		).toBe("`id` INT AUTO_INCREMENT PRIMARY KEY");
	});
});
