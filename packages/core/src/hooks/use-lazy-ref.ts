import { type RefObject, useRef } from "react";

export function useLazyRef<T>(fn: () => T): RefObject<T> {
	const ref = useRef<T | null>(null);
	if (ref.current === null) {
		ref.current = fn();
	}
	return ref as RefObject<T>;
}
