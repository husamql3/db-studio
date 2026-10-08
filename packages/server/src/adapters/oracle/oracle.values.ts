/** Keep NUMBER text exact unless it is an integer within JavaScript's safe range. */
export const toJsonNumber = (value: unknown) => {
	if (typeof value !== "string" || !/^[+-]?\d+$/.test(value)) return value;
	const number = Number(value);
	return Number.isSafeInteger(number) ? number : value;
};
