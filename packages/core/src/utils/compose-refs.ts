import { type Ref, type RefCallback, useCallback } from "react";

type PossibleRef<T> = Ref<T> | undefined;

function setRef<T>(ref: PossibleRef<T>, value: T) {
	if (typeof ref === "function") {
		return ref(value);
	}

	if (ref !== null && ref !== undefined) {
		ref.current = value;
	}
}

function composeRefs<T>(...refs: PossibleRef<T>[]): RefCallback<T> {
	return (node) => {
		let hasCleanup = false;
		const cleanups = refs.map((ref) => {
			const cleanup = setRef(ref, node);
			if (!hasCleanup && typeof cleanup === "function") {
				hasCleanup = true;
			}
			return cleanup;
		});

		if (hasCleanup) {
			return () => {
				for (let i = 0; i < cleanups.length; i++) {
					const cleanup = cleanups[i];
					if (typeof cleanup === "function") {
						cleanup();
					} else {
						setRef(refs[i], null);
					}
				}
			};
		}
	};
}

function useComposedRefs<T>(...refs: PossibleRef<T>[]): RefCallback<T> {
	return useCallback(composeRefs(...refs), refs);
}

export { composeRefs, useComposedRefs };
