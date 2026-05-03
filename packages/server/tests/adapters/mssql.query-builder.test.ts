import { describe, expect, it } from "vitest";
import {
	buildMssqlColumnDefinition,
	formatMssqlDefaultValue,
	buildSortClause,
	buildWhereClause,
	mapColumnTypeToMssql,
} from "@/adapters/mssql/mssql.query-builder.js";

describe("MSSQL query builder", () => {
	it("builds WHERE clauses with bracket identifiers and named params", () => {
		const result = buildWhereClause(
			[
				{ columnName: "status", operator: "=", value: "active" },
				{ columnName: "age", operator: "<", value: "50" },
				{ columnName: "age", operator: ">=", value: "18" },
				{ columnName: "name", operator: "like", value: "%ada%" },
				{ columnName: "name", operator: "not ilike", value: "%bot%" },
				{ columnName: "kind", operator: "is", value: "user" },
				{ columnName: "archived", operator: "is not", value: "true" },
				{ columnName: "deleted_at", operator: "is", value: "null" },
			],
			2,
		);

		expect(result.clause).toContain("[status] = @p2");
		expect(result.clause).toContain("[age] < @p3");
		expect(result.clause).toContain("[age] >= @p4");
		expect(result.clause).toContain("[name] LIKE @p5");
		expect(result.clause).toContain("[name] NOT LIKE @p6");
		expect(result.clause).toContain("[kind] = @p7");
		expect(result.clause).toContain("[archived] != @p8");
		expect(result.clause).toContain("[deleted_at] IS NULL");
		expect(result.values).toEqual(["active", "50", "18", "%ada%", "%bot%", "user", "true"]);
		expect(result.nextIdx).toBe(9);
		expect(buildWhereClause([{ columnName: "x", operator: "unknown", value: "1" }], 3)).toEqual({
			clause: "",
			values: [],
			nextIdx: 3,
		});
		expect(buildWhereClause([], 2)).toEqual({ clause: "", values: [], nextIdx: 2 });
	});

	it("builds ORDER BY clauses for OFFSET/FETCH queries", () => {
		expect(buildSortClause([{ columnName: "created_at", direction: "desc" }], "asc")).toBe(
			"ORDER BY [created_at] DESC",
		);
		expect(buildSortClause("id", "asc")).toBe("ORDER BY [id] ASC");
		expect(buildSortClause([], "asc")).toBe("");
		expect(buildSortClause("", "asc")).toBe("");
	});

	it("maps portable column definitions to MSSQL syntax", () => {
		expect(mapColumnTypeToMssql("serial", false)).toBe("INT IDENTITY(1,1)");
		expect(mapColumnTypeToMssql("bigserial", false)).toBe("BIGINT IDENTITY(1,1)");
		expect(mapColumnTypeToMssql("int2", false)).toBe("SMALLINT");
		expect(mapColumnTypeToMssql("double precision", false)).toBe("FLOAT");
		expect(mapColumnTypeToMssql("boolean", false)).toBe("BIT");
		expect(mapColumnTypeToMssql("uuid", false)).toBe("UNIQUEIDENTIFIER");
		expect(mapColumnTypeToMssql("jsonb", false)).toBe("NVARCHAR(MAX)");
		expect(mapColumnTypeToMssql("bytea", false)).toBe("VARBINARY(MAX)");
		expect(mapColumnTypeToMssql("custom_type", false)).toBe("CUSTOM_TYPE");
		expect(mapColumnTypeToMssql("text", true)).toBe("NVARCHAR(MAX)");
		expect(formatMssqlDefaultValue("newid()", "INT")).toBeNull();
		expect(formatMssqlDefaultValue("newid()", "UNIQUEIDENTIFIER")).toBe("NEWID()");
		expect(formatMssqlDefaultValue("getdate()", "DATETIME2")).toBe("GETDATE()");
		expect(formatMssqlDefaultValue("current_timestamp()", "DATETIME2")).toBe("GETDATE()");
		expect(formatMssqlDefaultValue("lower('A')", "NVARCHAR(MAX)")).toBe("lower('A')");
		expect(formatMssqlDefaultValue("null", "NVARCHAR(MAX)")).toBe("NULL");
		expect(formatMssqlDefaultValue("true", "BIT")).toBe("1");
		expect(formatMssqlDefaultValue("false", "BIT")).toBe("0");
		expect(
			buildMssqlColumnDefinition(
				{
					columnName: "email",
					columnType: "varchar",
					isNullable: false,
					isUnique: true,
					defaultValue: "'n/a'",
				},
				{ includeUnique: true },
			),
		).toBe("[email] VARCHAR(255) NOT NULL DEFAULT 'n/a' UNIQUE");
		expect(
			buildMssqlColumnDefinition(
				{
					columnName: "id",
					columnType: "int",
					isPrimaryKey: true,
					isIdentity: true,
				},
				{ includePrimaryKey: true },
			),
		).toBe("[id] INT IDENTITY(1,1) PRIMARY KEY");
	});
});
