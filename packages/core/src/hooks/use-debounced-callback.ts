import { useCallback, useEffect, useRef } from "react";
import { useCallbackRef } from "@/hooks/use-callback-ref";

export function useDebouncedCallback<T extends (...args: never[]) => unknown>(
	callback: T,
	delay: number,
) {
	const handleCallback = useCallbackRef(callback);
	const debounceTimerRef = useRef(0);
	useEffect(() => () => window.clearTimeout(debounceTimerRef.current), []);

	const setValue = useCallback(
		(...args: Parameters<T>) => {
			window.clearTimeout(debounceTimerRef.current);
			debounceTimerRef.current = window.setTimeout(() => handleCallback(...args), delay);
		},
		[handleCallback, delay],
	);

	return setValue;
}
