import { beforeEach, describe, expect, it } from "vitest";
import { useOverlayStore } from "./overlay.store";

// The store is a module-level singleton; reset it before each test so state
// does not leak across cases.
beforeEach(() => {
	useOverlayStore.setState({ openOverlays: [] });
});

const state = () => useOverlayStore.getState();

describe("useOverlayStore", () => {
	it("starts with no open overlays", () => {
		expect(state().openOverlays).toEqual([]);
	});

	describe("openOverlay", () => {
		it("opens an overlay", () => {
			state().openOverlay("records.add-record");
			expect(state().openOverlays).toEqual(["records.add-record"]);
		});

		it("stacks multiple distinct overlays in order", () => {
			state().openOverlay("records.add-record");
			state().openOverlay("records.bulk-insert");
			expect(state().openOverlays).toEqual(["records.add-record", "records.bulk-insert"]);
		});

		it("re-opening an already-open overlay moves it to the top of the stack", () => {
			state().openOverlay("records.add-record");
			state().openOverlay("records.bulk-insert");
			state().openOverlay("records.add-record");
			expect(state().openOverlays).toEqual(["records.bulk-insert", "records.add-record"]);
		});
	});

	describe("closeOverlay", () => {
		it("closes a specific overlay by id", () => {
			state().openOverlay("records.add-record");
			state().openOverlay("records.bulk-insert");
			state().closeOverlay("records.add-record");
			expect(state().openOverlays).toEqual(["records.bulk-insert"]);
		});

		it("closes the top overlay when called with no id", () => {
			state().openOverlay("records.add-record");
			state().openOverlay("records.bulk-insert");
			state().closeOverlay();
			expect(state().openOverlays).toEqual(["records.add-record"]);
		});

		it("is a no-op when closing an id that is not open", () => {
			state().openOverlay("records.add-record");
			state().closeOverlay("chat.assistant");
			expect(state().openOverlays).toEqual(["records.add-record"]);
		});
	});

	describe("closeAllOverlays", () => {
		it("clears every open overlay", () => {
			state().openOverlay("records.add-record");
			state().openOverlay("records.bulk-insert");
			state().closeAllOverlays();
			expect(state().openOverlays).toEqual([]);
		});
	});

	describe("toggleOverlay", () => {
		it("opens an overlay that is closed", () => {
			state().toggleOverlay("schema.add-column");
			expect(state().isOverlayOpen("schema.add-column")).toBe(true);
		});

		it("closes an overlay that is open", () => {
			state().openOverlay("schema.add-column");
			state().toggleOverlay("schema.add-column");
			expect(state().isOverlayOpen("schema.add-column")).toBe(false);
		});
	});

	describe("queries", () => {
		it("isOverlayOpen reflects presence in the stack", () => {
			expect(state().isOverlayOpen("chat.assistant")).toBe(false);
			state().openOverlay("chat.assistant");
			expect(state().isOverlayOpen("chat.assistant")).toBe(true);
		});

		it("getOverlayIndex returns the stack position, -1 when absent", () => {
			state().openOverlay("records.add-record");
			state().openOverlay("records.bulk-insert");
			expect(state().getOverlayIndex("records.add-record")).toBe(0);
			expect(state().getOverlayIndex("records.bulk-insert")).toBe(1);
			expect(state().getOverlayIndex("chat.assistant")).toBe(-1);
		});
	});
});
