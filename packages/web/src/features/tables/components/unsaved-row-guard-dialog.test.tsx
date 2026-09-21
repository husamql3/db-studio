import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOverlayStore } from "@/stores/overlay.store";
import { useRowDetailsStore } from "../stores/row-details.store";
import { UnsavedRowGuardDialog } from "./unsaved-row-guard-dialog";

const blocker = vi.hoisted(() => ({
	shouldBlockFn: undefined as undefined | (() => boolean),
	status: "idle" as "idle" | "blocked",
	proceed: vi.fn(),
	reset: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
	useBlocker: (opts: { shouldBlockFn: () => boolean }) => {
		blocker.shouldBlockFn = opts.shouldBlockFn;
		return { status: blocker.status, proceed: blocker.proceed, reset: blocker.reset };
	},
}));

describe("UnsavedRowGuardDialog", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		blocker.status = "idle";
		useOverlayStore.setState({ openOverlays: [] });
		useRowDetailsStore.setState({ tableName: null, rowIndex: null, isDirty: false });
	});

	it("lets navigation through while the row draft is clean", () => {
		render(<UnsavedRowGuardDialog />);

		expect(blocker.shouldBlockFn?.()).toBe(false);
		expect(screen.queryByText("Discard unsaved changes?")).not.toBeInTheDocument();
	});

	it("blocks navigation once the row draft is dirty", () => {
		render(<UnsavedRowGuardDialog />);

		useRowDetailsStore.getState().setDirty(true);

		expect(blocker.shouldBlockFn?.()).toBe(true);
	});

	it("keeps the draft when the prompt is dismissed", async () => {
		const user = userEvent.setup();
		blocker.status = "blocked";
		useRowDetailsStore.setState({ tableName: "users", rowIndex: 0, isDirty: true });
		useOverlayStore.getState().openOverlay("tables.row-details");
		render(<UnsavedRowGuardDialog />);

		await user.click(screen.getByRole("button", { name: "Keep editing" }));

		expect(blocker.reset).toHaveBeenCalledTimes(1);
		expect(blocker.proceed).not.toHaveBeenCalled();
		expect(useRowDetailsStore.getState().isDirty).toBe(true);
		expect(useOverlayStore.getState().openOverlays).toContain("tables.row-details");
	});

	it("closes the sheet and resumes navigation when the draft is discarded", async () => {
		const user = userEvent.setup();
		blocker.status = "blocked";
		useRowDetailsStore.setState({ tableName: "users", rowIndex: 0, isDirty: true });
		useOverlayStore.getState().openOverlay("tables.row-details");
		render(<UnsavedRowGuardDialog />);

		await user.click(screen.getByRole("button", { name: "Discard changes" }));

		expect(blocker.proceed).toHaveBeenCalledTimes(1);
		expect(useRowDetailsStore.getState().isDirty).toBe(false);
		expect(useOverlayStore.getState().openOverlays).not.toContain("tables.row-details");
	});
});
