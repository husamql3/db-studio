/**
 * Opens one client per key. Concurrent first calls share one attempt, so they never open two
 * clients; a failed attempt is forgotten, so the next call tries again.
 */
export const openOnce = <V, K = void>(open: (key: K) => Promise<V>) => {
	const opened = new Map<K, Promise<V>>();

	return {
		get: (key: K): Promise<V> => {
			const existing = opened.get(key);

			if (existing) return existing;
			const attempt = open(key);
			opened.set(key, attempt);
			attempt.catch(() => {
				if (opened.get(key) === attempt) opened.delete(key);
			});

			return attempt;
		},
		/** Forgets every client and resolves to the ones that opened, for closing. */
		drain: async (): Promise<V[]> => {
			const attempts = [...opened.values()];
			opened.clear();
			const settled = await Promise.allSettled(attempts);

			return settled.flatMap((result) =>
				result.status === "fulfilled" ? [result.value] : [],
			);
		},
	};
};
