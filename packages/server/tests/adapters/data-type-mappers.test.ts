import { describe, expect, it } from "vitest";
import { mapClickhouseToDataType } from "@/adapters/clickhouse/clickhouse.query-builder.js";
import { mapDuckdbToDataType } from "@/adapters/duckdb/duckdb.query-builder.js";
import { mapMssqlToDataType } from "@/adapters/mssql/mssql.query-builder.js";
import { mapMysqlToDataType } from "@/adapters/mysql/mysql.query-builder.js";
import { mapPostgresToDataType } from "@/adapters/pg/pg.query-builder.js";
import { mapSqliteToDataType } from "@/adapters/sqlite/sqlite.query-builder.js";

// The variant a column type maps to picks the grid's editor. Ways it can fail:
// - a time-of-day or YEAR column gets the date variant, whose calendar editor cannot hold
//   its value and stages a full date instead
// - a PostgreSQL array column (`ARRAY` in information_schema) gets the date variant
// - fixing the time rule by prefix also catches timestamp types, which must stay dates
describe("column type to cell variant", () => {
	it("keeps time-of-day and YEAR columns out of the date editor", () => {
		expect(mapPostgresToDataType("time without time zone")).toBe("text");
		expect(mapPostgresToDataType("time(3)")).toBe("text");
		expect(mapMysqlToDataType("time", "time")).toBe("text");
		expect(mapMysqlToDataType("year", "year")).toBe("text");
		expect(mapMssqlToDataType("time")).toBe("text");
		expect(mapSqliteToDataType("TIME")).toBe("text");
		expect(mapDuckdbToDataType("TIME")).toBe("text");
		expect(mapDuckdbToDataType("TIME WITH TIME ZONE")).toBe("text");
		expect(mapClickhouseToDataType("Time")).toBe("text");
		expect(mapClickhouseToDataType("Time64(3)")).toBe("text");
	});

	it("maps PostgreSQL arrays to the array variant", () => {
		expect(mapPostgresToDataType("ARRAY")).toBe("array");
		expect(mapPostgresToDataType("integer[]")).toBe("array");
	});

	it("keeps dates and timestamps as dates", () => {
		expect(mapPostgresToDataType("timestamp with time zone")).toBe("date");
		expect(mapMysqlToDataType("datetime", "datetime")).toBe("date");
		expect(mapMssqlToDataType("datetime2")).toBe("date");
		expect(mapSqliteToDataType("DATETIME")).toBe("date");
		expect(mapDuckdbToDataType("TIMESTAMP WITH TIME ZONE")).toBe("date");
		expect(mapDuckdbToDataType("TIMESTAMP_NS")).toBe("date");
		expect(mapClickhouseToDataType("Nullable(DateTime64(3))")).toBe("date");
	});
});
