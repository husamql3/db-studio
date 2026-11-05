import { describe, expect, it } from "vitest";
import { buildRowUpdates, isGeneratedColumn, toFormValues } from "./row-details-utils";

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

	describe("toFormValues", () => {
		it("stringifies values for form controls", () => {
			expect(
				toFormValues({ id: 1, code: "A", active: true, meta: { a: 1 }, missing: null }, [
					...cols,
				]),
			).toEqual({ id: "1", code: "A" });
		});
	});

	describe("buildRowUpdates", () => {
		it("maps dirty fields to update payloads", () => {
			expect(buildRowUpdates({ code: true, id: false }, { id: "1", code: "B" })).toEqual([
				{ columnName: "code", value: "B" },
			]);
		});
	});
});
