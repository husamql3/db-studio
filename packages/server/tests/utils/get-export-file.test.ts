import { describe, expect, it } from "vitest";
import { read, utils } from "xlsx";
import { getExportFile } from "@/utils/get-export-file.js";

const decode = (body: BodyInit): string =>
	Buffer.from(body as Uint8Array).toString("utf-8");

const cols = ["id", "name", "profile", "tags"];
const rows = [
	{ id: 1, name: "Ada", profile: { role: "admin", active: true }, tags: ["a", "b"] },
];

describe("getExportFile", () => {
	it("keeps compound values structured in the JSON export", () => {
		const parsed = JSON.parse(decode(getExportFile({ cols, rows, format: "json", tableName: "users" })));

		expect(parsed).toEqual(rows);
		expect(parsed[0].profile).toEqual({ role: "admin", active: true });
		expect(parsed[0].tags).toEqual(["a", "b"]);
	});

	it("serializes compound values for CSV rather than emitting [object Object]", () => {
		const csv = decode(getExportFile({ cols, rows, format: "csv", tableName: "users" }));

		expect(csv).not.toContain("[object Object]");
		expect(csv).toContain('{""role"":""admin"",""active"":true}');
		expect(csv).toContain('[""a"",""b""]');
	});

	it("serializes compound values for XLSX rather than emitting [object Object]", () => {
		const buffer = getExportFile({ cols, rows, format: "xlsx", tableName: "users" });
		const sheet = read(Buffer.from(buffer as Uint8Array), { type: "buffer" });
		const [first] = utils.sheet_to_json<Record<string, unknown>>(
			sheet.Sheets[sheet.SheetNames[0]],
		);

		expect(first?.profile).toBe('{"role":"admin","active":true}');
		expect(first?.tags).toBe('["a","b"]');
	});

	it("renders binary columns as hex rather than a serialized Buffer", () => {
		const binCols = ["id", "payload"];
		const binRows = [{ id: 1, payload: Buffer.from("hi") }];

		const csv = decode(
			getExportFile({ cols: binCols, rows: binRows, format: "csv", tableName: "blobs" }),
		);
		expect(csv).toContain("0x6869");
		expect(csv).not.toContain('"type":"Buffer"');
	});

	it("leaves scalar values untouched across formats", () => {
		const scalarCols = ["id", "name", "active", "missing"];
		const scalarRows = [{ id: 1, name: "Ada", active: true, missing: null }];

		const csv = decode(
			getExportFile({ cols: scalarCols, rows: scalarRows, format: "csv", tableName: "users" }),
		);
		expect(csv).toContain("1,Ada,TRUE");

		const parsed = JSON.parse(
			decode(
				getExportFile({ cols: scalarCols, rows: scalarRows, format: "json", tableName: "users" }),
			),
		);
		expect(parsed).toEqual(scalarRows);
	});
});
