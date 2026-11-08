/**
 * Failure modes:
 * - a blank line in a pasted single column (an empty cell) is dropped, so later values shift up
 *   into the wrong rows;
 * - the trailing newline spreadsheets append becomes an extra empty row that clears a cell;
 * - a quoted cell holding a tab or newline is split into several cells or rows;
 * - an unquoted cell with a quote inside (`5" screen`) is read as the start of a quoted field;
 * - copied text with a tab, newline or quote in a value pastes back into the wrong cells;
 * - `null` and `""` collapse: an empty cell in a nullable column becomes `""` (or a nullable
 *   text cell stays `""`, which the database stores instead of NULL);
 * - a non-number, `1.5` in an integer column, or an integer past 2^53 (silently rounded) is
 *   staged instead of flagged;
 * - `false`/`0` are read as true, or an unknown word as false;
 * - a value outside the enum, broken JSON, or an unparseable date is staged.
 */
import { describe, expect, it } from "vitest";
import { coercePastedValue, parseClipboardText, toClipboardText } from "./grid-clipboard";

describe("parseClipboardText", () => {
	it("keeps an empty cell in a single pasted column", () => {
		expect(parseClipboardText("a\n\nc\n")).toEqual([["a"], [""], ["c"]]);
	});

	it("drops only the trailing line break, also CRLF", () => {
		expect(parseClipboardText("1\t2\r\n3\t4\r\n")).toEqual([
			["1", "2"],
			["3", "4"],
		]);
	});

	it("reads a quoted cell with a tab, newline and escaped quote as one cell", () => {
		expect(parseClipboardText('"a\tb\nc ""d"""\tx')).toEqual([['a\tb\nc "d"', "x"]]);
	});

	it("keeps a quote inside an unquoted cell", () => {
		expect(parseClipboardText('5" screen\tok')).toEqual([['5" screen', "ok"]]);
	});

	it("round-trips copied values that hold tabs, newlines and quotes", () => {
		const rows = [
			["name", "note"],
			['say "hi"', "line1\nline2"],
			["tab\there", ""],
		];
		expect(parseClipboardText(toClipboardText(rows))).toEqual(rows);
	});
});

describe("coercePastedValue", () => {
	const text = { variant: "text" as const, isNullable: true };

	it("turns an empty cell into null only where the column allows it", () => {
		expect(coercePastedValue("", text)).toEqual({ value: null });
		expect(coercePastedValue("", { ...text, isNullable: false })).toEqual({ value: "" });
		expect(coercePastedValue("", { variant: "number", isNullable: false })).toHaveProperty(
			"error",
		);
	});

	it("keeps text exactly as pasted", () => {
		expect(coercePastedValue("  spaced ", text)).toEqual({ value: "  spaced " });
	});

	it("checks numbers and integer ranges", () => {
		const int = {
			variant: "number" as const,
			isNullable: true,
			dataTypeLabel: "int" as const,
		};
		expect(coercePastedValue(" 42 ", int)).toEqual({ value: 42 });
		expect(coercePastedValue("1.5", int)).toHaveProperty("error");
		expect(
			coercePastedValue("9007199254740993", { ...int, dataTypeLabel: "bigint" }),
		).toHaveProperty("error");
		expect(coercePastedValue("abc", { variant: "number", isNullable: true })).toHaveProperty(
			"error",
		);
		expect(
			coercePastedValue("1.5", {
				variant: "number",
				isNullable: true,
				dataTypeLabel: "numeric",
			}),
		).toEqual({ value: 1.5 });
	});

	it("reads booleans and refuses other words", () => {
		const bool = { variant: "boolean" as const, isNullable: true };
		expect(coercePastedValue("FALSE", bool)).toEqual({ value: false });
		expect(coercePastedValue("0", bool)).toEqual({ value: false });
		expect(coercePastedValue("t", bool)).toEqual({ value: true });
		expect(coercePastedValue("maybe", bool)).toHaveProperty("error");
	});

	it("refuses a value outside the enum", () => {
		const status = {
			variant: "enum" as const,
			isNullable: true,
			enumValues: ["open", "closed"],
		};
		expect(coercePastedValue("open", status)).toEqual({ value: "open" });
		expect(coercePastedValue("Open", status)).toHaveProperty("error");
	});

	it("parses JSON and refuses broken JSON", () => {
		const json = { variant: "json" as const, isNullable: true };
		expect(coercePastedValue('{"a":[1]}', json)).toEqual({ value: { a: [1] } });
		expect(coercePastedValue("{a:1}", json)).toHaveProperty("error");
	});

	it("keeps a valid date as pasted and refuses an unparseable one", () => {
		const date = {
			variant: "date" as const,
			isNullable: true,
			dataTypeLabel: "date" as const,
		};
		expect(coercePastedValue("2026-10-29", date)).toEqual({ value: "2026-10-29" });
		expect(coercePastedValue("next tuesday", date)).toHaveProperty("error");
		// time columns share the date variant; Date cannot parse their text
		expect(coercePastedValue("12:30:00", { ...date, dataTypeLabel: "time" })).toEqual({
			value: "12:30:00",
		});
	});
});
