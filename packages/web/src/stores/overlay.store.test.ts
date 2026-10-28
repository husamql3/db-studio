import { beforeEach, describe, expect, it } from "vitest";
import { useOverlayStore } from "./overlay.store";

// The store is a module-level singleton; reset it before each test so state
// does not leak across cases.
beforeEach(() => {
	useOverlayStore.setState({ openOverlays: [] });
});

const state = () => useOverlayStore.getState();

describe("useOverlayStore", () => {
	it("re-opening an already-open overlay moves it to the top of the stack", () => {
		state().openOverlay("records.add-record");
		state().openOverlay("records.bulk-insert");
		state().openOverlay("records.add-record");
		expect(state().openOverlays).toEqual(["records.bulk-insert", "records.add-record"]);
	});

	it("closes the top overlay when called with no id", () => {
		state().openOverlay("records.add-record");
		state().openOverlay("records.bulk-insert");
		state().closeOverlay();
		expect(state().openOverlays).toEqual(["records.add-record"]);
	});
});
