/**
 * Get a specific search parameter from the URL
 */
export const getSearchParam = (key: string): string | null => {
	if (typeof window === "undefined") return null;
	const params = new URLSearchParams(window.location.search);
	return params.get(key);
};

/**
 * Get all search parameters as an object
 */
export const getAllSearchParams = (): Record<string, string> => {
	if (typeof window === "undefined") return {};
	const params = new URLSearchParams(window.location.search);
	const result: Record<string, string> = {};

	params.forEach((value, key) => {
		result[key] = value;
	});

	return result;
};

/**
 * Set a search parameter in the URL
 */
export const setSearchParam = (key: string, value: string): void => {
	if (typeof window === "undefined") return;

	const params = new URLSearchParams(window.location.search);
	params.set(key, value);

	const newUrl = `${window.location.pathname}?${params.toString()}`;
	window.history.pushState({}, "", newUrl);

	// Dispatch custom event to notify listeners
	window.dispatchEvent(new CustomEvent("searchParamsChanged"));
};

/**
 * Set multiple search parameters at once
 */
export const setSearchParams = (updates: Record<string, string>): void => {
	if (typeof window === "undefined") return;

	const params = new URLSearchParams(window.location.search);

	Object.entries(updates).forEach(([key, value]) => {
		params.set(key, value);
	});

	const newUrl = `${window.location.pathname}?${params.toString()}`;
	window.history.pushState({}, "", newUrl);

	// Dispatch custom event to notify listeners
	window.dispatchEvent(new CustomEvent("searchParamsChanged"));
};

/**
 * Delete a search parameter from the URL
 */
export const deleteSearchParam = (key: string): void => {
	if (typeof window === "undefined") return;

	const params = new URLSearchParams(window.location.search);
	params.delete(key);

	const query = params.toString();
	const newUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
	window.history.pushState({}, "", newUrl);

	// Dispatch custom event to notify listeners
	window.dispatchEvent(new CustomEvent("searchParamsChanged"));
};

/**
 * Delete multiple search parameters at once
 */
export const deleteSearchParams = (keys: string[]): void => {
	if (typeof window === "undefined") return;

	const params = new URLSearchParams(window.location.search);

	keys.forEach((key) => {
		params.delete(key);
	});

	const query = params.toString();
	const newUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
	window.history.pushState({}, "", newUrl);

	// Dispatch custom event to notify listeners
	window.dispatchEvent(new CustomEvent("searchParamsChanged"));
};

/**
 * Clear all search parameters
 */
export const clearSearchParams = (): void => {
	if (typeof window === "undefined") return;
	window.history.pushState({}, "", window.location.pathname);

	// Dispatch custom event to notify listeners
	window.dispatchEvent(new CustomEvent("searchParamsChanged"));
};

/**
 * Check if a search parameter exists
 */
export const hasSearchParam = (key: string): boolean => {
	if (typeof window === "undefined") return false;
	const params = new URLSearchParams(window.location.search);
	return params.has(key);
};

/**
 * Replace entire search params (removes existing ones)
 */
export const replaceSearchParams = (newParams: Record<string, string>): void => {
	if (typeof window === "undefined") return;

	const params = new URLSearchParams();

	Object.entries(newParams).forEach(([key, value]) => {
		params.set(key, value);
	});

	const query = params.toString();
	const newUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
	window.history.pushState({}, "", newUrl);

	// Dispatch custom event to notify listeners
	window.dispatchEvent(new CustomEvent("searchParamsChanged"));
};
