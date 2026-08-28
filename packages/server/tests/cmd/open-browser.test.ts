import { describe, expect, it } from "vitest";

import { shouldOpenBrowser } from "@/cmd/open-browser.js";

describe("browser startup behavior", () => {
	it("honors explicit browser overrides", () => {
		expect(shouldOpenBrowser(true)).toBe(true);
		expect(shouldOpenBrowser(false)).toBe(false);
	});

	it("does not open a browser by default", () => {
		expect(shouldOpenBrowser()).toBe(false);
	});
});
