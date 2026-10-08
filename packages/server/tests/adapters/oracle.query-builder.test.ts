/**
 * Oracle temporal and foreign-key failure modes covered here:
 *
 * 1. DATE, TIMESTAMP, TIMESTAMP WITH TIME ZONE, and TIMESTAMP WITH LOCAL TIME ZONE strings can
 *    fall through as untyped binds, making Oracle guess their format from mutable NLS state.
 * 2. JavaScript Date truncates fractional seconds after three digits, so timestamp keys that
 *    differ later can address the wrong row.
 * 3. Offset timestamps can lose their offset, while local-time-zone timestamps can change with
 *    the pooled session's time zone.
 * 4. Native temporal columns selected without TO_CHAR reach node-oracledb Thin as Date objects
 *    and lose sub-millisecond precision before a converter can run.
 * 5. USER_CONS_COLUMNS returns one row per foreign-key column. Treating those rows as separate
 *    constraints turns a composite reference into independent matches that delete sibling rows.
 * 6. An unqualified ORDER BY can resolve to a temporal string alias instead of the native column,
 *    which gives mixed-offset timestamps the wrong chronological order.
 * 7. Temporal LIKE patterns sent through timestamp normalization are rejected as invalid values
 *    instead of matching the canonical string returned by table reads.
 */
import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vitest";
import {
	bindOracleValue,
	buildFilterConditions,
	buildOrderBy,
	buildOracleSelectList,
	createBinds,
	groupOracleForeignKeys,
} from "@/adapters/oracle/oracle.query-builder.js";

describe("Oracle temporal SQL", () => {
	it.each([
		{
			type: "DATE",
			input: "2026-10-07",
			expectedValue: "2026-10-07T00:00:00",
			expectedSql: `TO_DATE(:1, 'YYYY-MM-DD"T"HH24:MI:SS')`,
		},
		{
			type: "TIMESTAMP(9)",
			input: "2026-10-07T12:34:56.123456789+03:00",
			expectedValue: "2026-10-07T12:34:56.123456789",
			expectedSql: `TO_TIMESTAMP(:1, 'YYYY-MM-DD"T"HH24:MI:SS.FF9')`,
		},
		{
			type: "TIMESTAMP(9) WITH TIME ZONE",
			input: "2026-10-07T12:34:56.123456Z",
			expectedValue: "2026-10-07T12:34:56.123456000+00:00",
			expectedSql: `TO_TIMESTAMP_TZ(:1, 'YYYY-MM-DD"T"HH24:MI:SS.FF9TZH:TZM')`,
		},
		{
			type: "TIMESTAMP(9) WITH LOCAL TIME ZONE",
			input: "2026-10-07 12:34:56.1",
			expectedValue: "2026-10-07T12:34:56.100000000+00:00",
			expectedSql: `TO_TIMESTAMP_TZ(:1, 'YYYY-MM-DD"T"HH24:MI:SS.FF9TZH:TZM')`,
		},
	])("binds $type through an explicit format", ({ type, input, expectedValue, expectedSql }) => {
		const { values, bind } = createBinds();
		expect(bindOracleValue(input, type, bind)).toBe(expectedSql);
		expect(values).toEqual([expectedValue]);
	});

	it("rejects an invalid temporal value before Oracle can guess its format", () => {
		const { bind } = createBinds();
		expect(() => bindOracleValue("07/10/2026", "TIMESTAMP", bind)).toThrow(HTTPException);
	});

	it("keeps the temporal SQL shape when a nullable value is null", () => {
		const { values, bind } = createBinds();
		expect(bindOracleValue(null, "TIMESTAMP(9)", bind)).toBe(
			`TO_TIMESTAMP(:1, 'YYYY-MM-DD"T"HH24:MI:SS.FF9')`,
		);
		expect(values).toEqual([null]);
	});

	it("projects native temporal columns as strings before they cross the driver boundary", () => {
		expect(
			buildOracleSelectList([
				{ COLUMN_NAME: "id", DATA_TYPE: "NUMBER" },
				{ COLUMN_NAME: "made_on", DATA_TYPE: "DATE" },
				{ COLUMN_NAME: "recorded_at", DATA_TYPE: "TIMESTAMP(9)" },
				{ COLUMN_NAME: "zoned_at", DATA_TYPE: "TIMESTAMP(9) WITH TIME ZONE" },
				{ COLUMN_NAME: "local_at", DATA_TYPE: "TIMESTAMP(9) WITH LOCAL TIME ZONE" },
			]),
		).toBe(
			`"id", TO_CHAR("made_on", 'YYYY-MM-DD"T"HH24:MI:SS') AS "made_on", TO_CHAR("recorded_at", 'YYYY-MM-DD"T"HH24:MI:SS.FF9') AS "recorded_at", TO_CHAR("zoned_at", 'YYYY-MM-DD"T"HH24:MI:SS.FF9TZH:TZM') AS "zoned_at", TO_CHAR("local_at", 'YYYY-MM-DD"T"HH24:MI:SS.FF9') AS "local_at"`,
		);
	});

	it("qualifies native ordering when a temporal projection keeps the column name", () => {
		expect(
			buildOrderBy(
				[
					{ column: "zoned_at", direction: "asc" },
					{ column: null, direction: "asc" },
				],
				"source",
			),
		).toBe('ORDER BY source."zoned_at" ASC, source.ROWID ASC');
	});

	it("formats temporal LIKE operands but keeps range comparisons native", () => {
		const { values, bind } = createBinds();
		expect(
			buildFilterConditions(
				[
					{ columnName: "zoned_at", operator: "like", value: "2026-01%" },
					{ columnName: "zoned_at", operator: "not ilike", value: "%+05:00" },
					{
						columnName: "zoned_at",
						operator: ">=",
						value: "2026-01-01T00:00:00.000000000+00:00",
					},
				],
				bind,
				new Map([["zoned_at", "TIMESTAMP(9) WITH TIME ZONE"]]),
			),
		).toEqual([
			`TO_CHAR("zoned_at", 'YYYY-MM-DD"T"HH24:MI:SS.FF9TZH:TZM') LIKE :1`,
			`UPPER(TO_CHAR("zoned_at", 'YYYY-MM-DD"T"HH24:MI:SS.FF9TZH:TZM')) NOT LIKE UPPER(:2)`,
			`"zoned_at" >= TO_TIMESTAMP_TZ(:3, 'YYYY-MM-DD"T"HH24:MI:SS.FF9TZH:TZM')`,
		]);
		expect(values).toEqual([
			"2026-01%",
			"%+05:00",
			"2026-01-01T00:00:00.000000000+00:00",
		]);
	});
});

describe("Oracle foreign-key metadata", () => {
	it("groups ordered composite columns by constraint", () => {
		expect(
			groupOracleForeignKeys([
				{
					CONSTRAINT_NAME: "child_parent_pair",
					REFERENCING_TABLE: "child",
					REFERENCING_COLUMN: "tenant_id",
					REFERENCED_TABLE: "parent",
					REFERENCED_COLUMN: "tenant_id",
				},
				{
					CONSTRAINT_NAME: "child_parent_pair",
					REFERENCING_TABLE: "child",
					REFERENCING_COLUMN: "item_id",
					REFERENCED_TABLE: "parent",
					REFERENCED_COLUMN: "item_id",
				},
				{
					CONSTRAINT_NAME: "audit_parent",
					REFERENCING_TABLE: "audit",
					REFERENCING_COLUMN: "parent_id",
					REFERENCED_TABLE: "parent",
					REFERENCED_COLUMN: "id",
				},
			]),
		).toEqual([
			{
				constraintName: "child_parent_pair",
				referencingTable: "child",
				columns: ["tenant_id", "item_id"],
				referencedTable: "parent",
				referencedColumns: ["tenant_id", "item_id"],
			},
			{
				constraintName: "audit_parent",
				referencingTable: "audit",
				columns: ["parent_id"],
				referencedTable: "parent",
				referencedColumns: ["id"],
			},
		]);
	});
});
