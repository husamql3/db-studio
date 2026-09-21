import { useBlocker } from "@tanstack/react-router";
import { useOverlayStore } from "@/stores/overlay.store";
import { useRowDetailsStore } from "../stores/row-details.store";

/**
 * Switching table, switching database, or leaving the table route unmounts the
 * row-details sheet, which would drop an unsaved draft without ever showing the
 * sheet's own discard prompt. Block the navigation while the draft is dirty so
 * the same confirmation decides whether the edits are thrown away.
 */
export const useUnsavedRowGuard = () => {
	const { clearRowDetails } = useRowDetailsStore();
	const { closeOverlay } = useOverlayStore();

	const { status, proceed, reset } = useBlocker({
		// Read through getState so the predicate never blocks on a stale render.
		shouldBlockFn: () => useRowDetailsStore.getState().isDirty,
		withResolver: true,
	});

	return {
		isBlocked: status === "blocked",
		discardAndContinue: () => {
			clearRowDetails();
			closeOverlay("tables.row-details");
			proceed?.();
		},
		keepEditing: () => reset?.(),
	};
};
