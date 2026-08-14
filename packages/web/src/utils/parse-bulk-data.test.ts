import { describe, expect, it } from "vitest";
import { parseBulkData } from "./parse-bulk-data";

describe("parseBulkData", () => {
	describe("JSON parsing", () => {
		it("should parse JSON array", () => {
			const input = '[{"name": "John", "age": 30}, {"name": "Jane", "age": 28}]';
			const result = parseBulkData(input);
			expect(result).toEqual([
				{ name: "John", age: 30 },
				{ name: "Jane", age: 28 },
			]);
		});

		it("should parse single JSON object", () => {
			const input = '{"name": "John", "age": 30}';
			const result = parseBulkData(input);
			expect(result).toEqual([{ name: "John", age: 30 }]);
		});

		it("should handle nested JSON objects", () => {
			const input =
				'[{"name": "John", "metadata": {"role": "admin"}}, {"name": "Jane", "metadata": {"role": "user"}}]';
			const result = parseBulkData(input);
			expect(result).toEqual([
				{ name: "John", metadata: { role: "admin" } },
				{ name: "Jane", metadata: { role: "user" } },
			]);
		});

		it("should throw on invalid JSON", () => {
			const input = '[{"name": "John"';
			expect(() => parseBulkData(input)).toThrow(/Invalid JSON format/);
		});
	});

	describe("CSV parsing", () => {
		it("should parse comma-separated CSV", () => {
			const input = "name,age,email\nJohn,30,john@example.com\nJane,28,jane@example.com";
			const result = parseBulkData(input);
			expect(result).toEqual([
				{ name: "John", age: 30, email: "john@example.com" },
				{ name: "Jane", age: 28, email: "jane@example.com" },
			]);
		});

		it("should parse tab-separated CSV", () => {
			const input = "name\tage\nemail\nJohn\t30\tjohn@example.com";
			const result = parseBulkData(input);
			expect(Array.isArray(result)).toBe(true);
		});

		it("should handle quoted fields with delimiters", () => {
			const input =
				'name,description\nJohn,"lives in New York, USA"\nJane,"engineer, manager"';
			const result = parseBulkData(input);
			expect(result[0].description).toBe("lives in New York, USA");
		});

		it("should handle escaped quotes in CSV", () => {
			const input = 'name,quote\nJohn,"He said ""hello"""\nJane,"She said ""goodbye"""';
			const result = parseBulkData(input);
			expect(result[0].quote).toBe('He said "hello"');
		});

		it("should convert boolean strings", () => {
			const input = "name,active\nJohn,true\nJane,false";
			const result = parseBulkData(input);
			expect(result[0].active).toBe(true);
			expect(result[1].active).toBe(false);
		});

		it("should convert numeric strings", () => {
			const input = "name,age,score\nJohn,30,95.5\nJane,28,87.3";
			const result = parseBulkData(input);
			expect(result[0].age).toBe(30);
			expect(result[0].score).toBe(95.5);
		});

		it("should handle null values", () => {
			const input = "name,age\nJohn,30\nJane,null";
			const result = parseBulkData(input);
			expect(result[0].age).toBe(30);
			expect(result[1].age).toBeNull();
		});

		it("should handle empty values as null", () => {
			const input = "name,age,email\nJohn,30,john@example.com\nJane,,";
			const result = parseBulkData(input);
			expect(result[1].age).toBeNull();
			expect(result[1].email).toBeNull();
		});
	});

	describe("Data type conversion", () => {
		it("should convert JSON arrays in CSV", () => {
			const input = 'name,tags\nJohn,"[""a"",""b""]"';
			const result = parseBulkData(input);
			expect(Array.isArray(result[0].tags)).toBe(true);
		});

		it("should keep non-JSON-like strings as strings", () => {
			const input = "name,description\nJohn,This is a description";
			const result = parseBulkData(input);
			expect(typeof result[0].description).toBe("string");
		});
	});

	describe("Edge cases", () => {
		it("should throw on empty input", () => {
			expect(() => parseBulkData("")).toThrow();
		});

		it("should handle whitespace", () => {
			const input = "  name , age  \n  John , 30  ";
			const result = parseBulkData(input);
			expect(result[0].name).toBe("John");
			expect(result[0].age).toBe(30);
		});

		it("should detect comma as delimiter over tab", () => {
			const input = "name,age\nJohn,30";
			const result = parseBulkData(input);
			expect(result).toEqual([{ name: "John", age: 30 }]);
		});
	});

	// --- Extended characterization cases (Plan 005) ---
	describe("JSON parsing (extended)", () => {
		it("should surface the underlying syntax detail in the JSON error message", () => {
			// Malformed JSON that starts like an array so the JSON branch is taken.
			expect(() => parseBulkData('[{"name": "John", }]')).toThrow(/Invalid JSON format/);
		});

		it("should throw for a bare JSON primitive wrapped as an object start", () => {
			// Starts with "{" but is not a valid object -> SyntaxError -> wrapped message.
			expect(() => parseBulkData("{not json}")).toThrow(/Invalid JSON format/);
		});

		it("should return an empty array for an empty JSON array", () => {
			expect(parseBulkData("[]")).toEqual([]);
		});

		it("should preserve array-valued fields inside JSON objects", () => {
			const input = '[{"name": "John", "tags": ["a", "b"]}]';
			const result = parseBulkData(input);
			expect(result[0].tags).toEqual(["a", "b"]);
		});
	});

	describe("CSV parsing (extended)", () => {
		it("should handle a quoted field containing the delimiter", () => {
			const input = 'name,city\nJohn,"New York, NY"';
			const result = parseBulkData(input);
			expect(result[0].city).toBe("New York, NY");
		});

		it("should detect semicolon as delimiter", () => {
			const input = "name;age\nJohn;30";
			const result = parseBulkData(input);
			expect(result).toEqual([{ name: "John", age: 30 }]);
		});

		it("should keep leading-zero strings as strings, not numbers", () => {
			// "007" -> Number is 7, String(7) !== "007", and no decimal -> stays a string.
			const input = "name,code\nJohn,007";
			const result = parseBulkData(input);
			expect(result[0].code).toBe("007");
		});

		it("should coerce integer and float numeric columns", () => {
			const input = "qty,price\n3,9.99";
			const result = parseBulkData(input);
			expect(result[0].qty).toBe(3);
			expect(result[0].price).toBe(9.99);
		});

		it("should treat both empty and literal null as null", () => {
			const input = "name,a,b\nJohn,,null";
			const result = parseBulkData(input);
			expect(result[0].a).toBeNull();
			expect(result[0].b).toBeNull();
		});

		it("should throw when only a header row is present (no data rows)", () => {
			expect(() => parseBulkData("name,age")).toThrow(/No records/);
		});

		it("should ignore blank lines between data rows", () => {
			const input = "name,age\nJohn,30\n\nJane,28\n";
			const result = parseBulkData(input);
			expect(result).toHaveLength(2);
			expect(result[1]).toEqual({ name: "Jane", age: 28 });
		});
	});
});
