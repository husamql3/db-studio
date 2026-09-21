import { useCallback, useEffect, useRef } from "react";

export const ROW_DETAILS_OPEN_DELAY = 250;

// Delays an action so a double-click can cancel it first. The row grid uses
// this to open the details sheet on single-click without stealing the
// double-click that starts inline cell editing.
export const useDelayedRowOpen = (delay: number = ROW_DETAILS_OPEN_DELAY) => {
	const timerRef = useRef<number | null>(null);

	useEffect(
		() => () => {
			if (timerRef.current !== null) {
				window.clearTimeout(timerRef.current);
			}
		},
		[],
	);

	const schedule = useCallback(
		(action: () => void) => {
			if (timerRef.current !== null) {
				window.clearTimeout(timerRef.current);
			}
			timerRef.current = window.setTimeout(() => {
				timerRef.current = null;
				action();
			}, delay);
		},
		[delay],
	);

	const cancel = useCallback(() => {
		if (timerRef.current !== null) {
			window.clearTimeout(timerRef.current);
			timerRef.current = null;
		}
	}, []);

	return { schedule, cancel };
};
