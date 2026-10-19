import type { ColumnInfoSchemaType } from "@db-studio/shared/types";
import { describe, expect, it } from "vitest";
import type { SchemaGraphTable } from "@/shared/api";
import { buildSchemaGraph } from "./schema-graph";

/*
 * Failure modes:
 * - An FK into `public.accounts` links to a same-named `sales.accounts` instead.
 * - Narrowing to the source's schema keeps an edge into a same-named table there.
 * - A MySQL FK into another database's `accounts` links to the local `accounts`.
 * - An FK into a table listed without a schema stops linking.
 */

const column = (
	columnName: string,
	reference?: Pick<ColumnInfoSchemaType, "referencedTable" | "referencedSchema">,
): ColumnInfoSchemaType => ({
	columnName,
	dataType: "number",
	dataTypeLabel: "int",
	isNullable: false,
	columnDefault: null,
	isPrimaryKey: !reference,
	isForeignKey: !!reference,
	referencedTable: reference?.referencedTable ?? null,
	referencedColumn: reference ? "id" : null,
	enumValues: null,
	...(reference?.referencedSchema && { referencedSchema: reference.referencedSchema }),
});

const table = (
	tableName: string,
	schemaName: string | undefined,
	columns: ColumnInfoSchemaType[],
): SchemaGraphTable => ({ tableName, schemaName, rowCount: 0, columns });

const targets = (tables: SchemaGraphTable[], schema = "all") =>
	buildSchemaGraph(tables, schema).edges.map((edge) => `${edge.source} -> ${edge.target}`);

describe("buildSchemaGraph", () => {
	const pgTables = [
		table("orders", "sales", [
			column("id"),
			column("account_id", { referencedTable: "accounts", referencedSchema: "public" }),
		]),
		table("accounts", "sales", [column("id")]),
		table("accounts", "public", [column("id")]),
	];

	it("links an FK to the referenced schema's table, not a same-named one", () => {
		expect(targets(pgTables)).toEqual(["sales.orders -> public.accounts"]);
	});

	it("drops an FK whose referenced schema is filtered out", () => {
		expect(targets(pgTables, "sales")).toEqual([]);
	});

	it("drops a MySQL FK into another database", () => {
		const tables = [
			table("orders", undefined, [
				column("id"),
				column("account_id", { referencedTable: "accounts", referencedSchema: "billing" }),
			]),
			table("accounts", undefined, [column("id")]),
		];
		expect(targets(tables)).toEqual([]);
	});

	it("links an FK into a table listed without a schema", () => {
		const tables = [
			table("orders", undefined, [
				column("id"),
				column("account_id", { referencedTable: "accounts", referencedSchema: undefined }),
			]),
			table("accounts", undefined, [column("id")]),
		];
		expect(targets(tables)).toEqual(["orders -> accounts"]);
	});
});
