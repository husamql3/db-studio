/**
 * NUMBER conversion failure modes:
 * - a high-precision fraction rounds to an integer and borrows that row's primary key;
 * - a wide integer rounds to a neighboring value;
 * - exponent notation rounds or underflows before conversion is judged safe;
 * - ordinary safe integer metadata stops being numeric.
 */
import { describe, expect, it } from "vitest";
import { toJsonNumber } from "@/adapters/oracle/oracle.values.js";

describe("Oracle NUMBER values", () => {
	it.each(["1.0000000000000000001", "0.9999999999999999999", "-1.0000000000000000001", "9007199254740990.1"])("preserves fractional key %s", (value) => {
		expect(toJsonNumber(value)).toBe(value);
	});
	it.each(["9007199254740993", "100000000000000000000", "-9007199254740993"])("preserves wide integer %s", (value) => {
		expect(toJsonNumber(value)).toBe(value);
	});
	it.each(["1.0000000000000000001e0", "1e-130", "1e126"])("preserves exponent notation %s", (value) => {
		expect(toJsonNumber(value)).toBe(value);
	});
	it.each([["0", 0], ["-42", -42], ["9007199254740991", 9007199254740991]] as const)("keeps safe integer %s numeric", (value, expected) => {
		expect(toJsonNumber(value)).toBe(expected);
	});
});
