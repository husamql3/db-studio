import { useCallback, useEffect, useMemo, useState } from "react";

// Custom event name for search params changes
const SEARCH_PARAMS_CHANGE_EVENT = "searchParamsChange";

export function useSearchParamsUtils() {
	const [searchParams, setSearchParamsState] = useState(
		() => new URLSearchParams(window.location.search),
	);

	// Sync with browser history changes and custom events
	useEffect(() => {
		const handlePopState = () => {
			setSearchParamsState(new URLSearchParams(window.location.search));
		};

		const handleSearchParamsChange = () => {
			setSearchParamsState(new URLSearchParams(window.location.search));
		};

		window.addEventListener("popstate", handlePopState);
		window.addEventListener(SEARCH_PARAMS_CHANGE_EVENT, handleSearchParamsChange);

		return () => {
			window.removeEventListener("popstate", handlePopState);
			window.removeEventListener(SEARCH_PARAMS_CHANGE_EVENT, handleSearchParamsChange);
		};
	}, []);

	// Helper to update URL and state
	const setSearchParams = useCallback(
		(
			updater: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams),
			options?: { replace?: boolean },
		) => {
			const newParams = typeof updater === "function" ? updater(searchParams) : updater;
			const newUrl = `${window.location.pathname}${newParams.toString() ? `?${newParams.toString()}` : ""}`;

			if (options?.replace) {
				window.history.replaceState(null, "", newUrl);
			} else {
				window.history.pushState(null, "", newUrl);
			}

			setSearchParamsState(new URLSearchParams(newParams));

			// Dispatch custom event to notify other instances
			window.dispatchEvent(new Event(SEARCH_PARAMS_CHANGE_EVENT));
		},
		[searchParams],
	);

	// Get a single param value
	const getParam = useCallback(
		(key: string): string | null => {
			return searchParams.get(key);
		},
		[searchParams],
	);

	// Get all values for a param (for params that can appear multiple times)
	const getParamAll = useCallback(
		(key: string): string[] => {
			return searchParams.getAll(key);
		},
		[searchParams],
	);

	// Set a single param (replaces existing value)
	const setParam = useCallback(
		(key: string, value: string | number | boolean, replace = false) => {
			setSearchParams(
				(prev) => {
					const next = new URLSearchParams(prev);
					next.set(key, String(value));
					return next;
				},
				{ replace },
			);
		},
		[setSearchParams],
	);

	// Set multiple params at once (optimal for batch updates)
	const setParams = useCallback(
		(
			params: Record<string, string | number | boolean | null | undefined>,
			replace = false,
		) => {
			setSearchParams(
				(prev) => {
					const next = new URLSearchParams(prev);
					Object.entries(params).forEach(([key, value]) => {
						if (value === null || value === undefined) {
							next.delete(key);
						} else {
							next.set(key, String(value));
						}
					});
					return next;
				},
				{ replace },
			);
		},
		[setSearchParams],
	);

	// Delete a single param
	const deleteParam = useCallback(
		(key: string, replace = false) => {
			setSearchParams(
				(prev) => {
					const next = new URLSearchParams(prev);
					next.delete(key);
					return next;
				},
				{ replace },
			);
		},
		[setSearchParams],
	);

	// Delete multiple params at once
	const deleteParams = useCallback(
		(keys: string[], replace = false) => {
			setSearchParams(
				(prev) => {
					const next = new URLSearchParams(prev);
					for (const key of keys) {
						next.delete(key);
					}
					return next;
				},
				{ replace },
			);
		},
		[setSearchParams],
	);

	// Check if a param exists
	const hasParam = useCallback(
		(key: string): boolean => {
			return searchParams.has(key);
		},
		[searchParams],
	);

	// Get all params as an object
	const getAllParams = useMemo(() => {
		return Object.fromEntries(searchParams.entries());
	}, [searchParams]);

	// Clear all params
	const clearParams = useCallback(
		(replace = false) => {
			setSearchParams(new URLSearchParams(), { replace });
		},
		[setSearchParams],
	);

	// Toggle a boolean param (useful for filters)
	const toggleParam = useCallback(
		(key: string, replace = false) => {
			setSearchParams(
				(prev) => {
					const next = new URLSearchParams(prev);
					if (next.has(key)) {
						next.delete(key);
					} else {
						next.set(key, "true");
					}
					return next;
				},
				{ replace },
			);
		},
		[setSearchParams],
	);

	// Get param as number (with fallback)
	const getParamAsNumber = useCallback(
		(key: string, fallback?: number): number | null => {
			const value = searchParams.get(key);
			if (value === null) return fallback ?? null;
			const num = Number(value);
			return Number.isNaN(num) ? (fallback ?? null) : num;
		},
		[searchParams],
	);

	// Get param as boolean
	const getParamAsBoolean = useCallback(
		(key: string): boolean => {
			const value = searchParams.get(key);
			return value === "true" || value === "1";
		},
		[searchParams],
	);

	// Get param as array (comma-separated)
	const getParamAsArray = useCallback(
		(key: string, separator = ","): string[] => {
			const value = searchParams.get(key);
			return value ? value.split(separator).filter(Boolean) : [];
		},
		[searchParams],
	);

	// Set array as param (comma-separated)
	const setParamArray = useCallback(
		(key: string, values: string[], separator = ",", replace = false) => {
			setSearchParams(
				(prev) => {
					const next = new URLSearchParams(prev);
					if (values.length === 0) {
						next.delete(key);
					} else {
						next.set(key, values.join(separator));
					}
					return next;
				},
				{ replace },
			);
		},
		[setSearchParams],
	);

	return {
		// Read operations
		getParam,
		getParamAll,
		getParamAsNumber,
		getParamAsBoolean,
		getParamAsArray,
		hasParam,
		getAllParams,

		// Write operations
		setParam,
		setParams,
		setParamArray,
		deleteParam,
		deleteParams,
		toggleParam,
		clearParams,

		// Raw access
		searchParams,
	};
}
