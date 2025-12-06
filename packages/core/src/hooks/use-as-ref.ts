import { useEffect, useLayoutEffect, useRef } from "react";

export const useIsomorphicLayoutEffect =
	typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function useAsRef<T>(data: T) {
	const ref = useRef<T>(data);

	useIsomorphicLayoutEffect(() => {
		ref.current = data;
	});

	return ref;
}
