import { describe, expect, it } from "vitest";
import {
	buildRowUpdates,
	getPrimaryKeyColumn,
	getRecordIdentity,
	isGeneratedColumn,
	toFormValues,
} from "./row-details-utils";

const cols = [
	{
		columnName: "id",
		dataType: "number",
		dataTypeLabel: "int",
		isNullable: false,
		columnDefault: "nextval('users_id_seq'::regclass)",
		isPrimaryKey: true,
		isForeignKey: false,
		referencedTable: null,
		referencedColumn: null,
		enumValues: null,
	},
	{
		columnName: "code",
		dataType: "text",
		dataTypeLabel: "text",
		isNullable: false,
		columnDefault: null,
		isPrimaryKey: false,
		isForeignKey: false,
		referencedTable: null,
		referencedColumn: null,
		enumValues: null,
	},
] as const;

describe("row-details-utils", () => {
	describe("isGeneratedColumn", () => {
		it("detects sequence defaults", () => {
			expect(isGeneratedColumn({ columnDefault: "nextval('users_id_seq'::regclass)" })).toBe(
				true,
			);
		});

		it("detects identity and auto-increment defaults", () => {
			expect(isGeneratedColumn({ columnDefault: "auto_increment" })).toBe(true);
			expect(isGeneratedColumn({ columnDefault: "AUTOINCREMENT" })).toBe(true);
			expect(isGeneratedColumn({ columnDefault: "generated always as identity" })).toBe(true);
			expect(isGeneratedColumn({ columnDefault: "IDENTITY(1,1)" })).toBe(true);
		});

		it("treats plain columns as editable", () => {
			expect(isGeneratedColumn({ columnDefault: null })).toBe(false);
			expect(isGeneratedColumn({ columnDefault: "now()" })).toBe(false);
			expect(isGeneratedColumn({ columnDefault: "'active'" })).toBe(false);
		});
	});

	describe("getPrimaryKeyColumn", () => {
		it("returns the primary key column", () => {
			expect(getPrimaryKeyColumn([...cols])?.columnName).toBe("id");
		});

		it("returns undefined without a primary key", () => {
			expect(getPrimaryKeyColumn([])).toBeUndefined();
			expect(getPrimaryKeyColumn(undefined)).toBeUndefined();
		});
	});

	describe("getRecordIdentity", () => {
		it("returns primary key identity for single key", () => {
			expect(getRecordIdentity({ id: 1, code: "A" }, [...cols])).toBe(
				JSON.stringify([["id", "1"]]),
			);
		});

		it("returns composite primary key identity without delimiter collisions", () => {
			const compositeCols = [
				{ ...cols[0], columnName: "tenant_id", isPrimaryKey: true },
				{ ...cols[1], columnName: "user_id", isPrimaryKey: true },
			];
			const id1 = getRecordIdentity({ tenant_id: "org:1|part", user_id: "42" }, compositeCols);
			const id2 = getRecordIdentity({ tenant_id: "org", user_id: "1|part:42" }, compositeCols);
			expect(id1).toBe(
				JSON.stringify([
					["tenant_id", "org:1|part"],
					["user_id", "42"],
				]),
			);
			expect(id2).toBe(
				JSON.stringify([
					["tenant_id", "org"],
					["user_id", "1|part:42"],
				]),
			);
			expect(id1).not.toBe(id2);
		});

		it("falls back to id column without a primary key", () => {
			const nonPkCols = cols.map((col) => ({ ...col, isPrimaryKey: false }));
			expect(getRecordIdentity({ id: 123, code: "A" }, nonPkCols)).toBe(
				JSON.stringify(["id", "123"]),
			);
		});

		it("returns undefined when no key or id is present", () => {
			const noIdCols = [{ ...cols[1], columnName: "title", isPrimaryKey: false }];
			expect(getRecordIdentity({ title: "test" }, noIdCols)).toBeUndefined();
			expect(getRecordIdentity(undefined, cols)).toBeUndefined();
			expect(getRecordIdentity({ id: 1 }, undefined)).toBeUndefined();
		});
	});

	describe("toFormValues", () => {
		it("stringifies values for form controls", () => {
			expect(
				toFormValues({ id: 1, code: "A", active: true, meta: { a: 1 }, missing: null }, [
					...cols,
				]),
			).toEqual({ id: "1", code: "A" });
		});

		it("returns empty values without a row or columns", () => {
			expect(toFormValues(undefined, [...cols])).toEqual({});
			expect(toFormValues({ id: 1 }, undefined)).toEqual({});
		});
	});

	describe("buildRowUpdates", () => {
		it("maps dirty fields to update payloads", () => {
			expect(buildRowUpdates({ code: true, id: false }, { id: "1", code: "B" })).toEqual([
				{ columnName: "code", value: "B" },
			]);
		});

		it("returns no updates when nothing is dirty", () => {
			expect(buildRowUpdates({}, { id: "1" })).toEqual([]);
		});
	});
});
