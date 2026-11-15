const resets: (() => void)[] = [];

/**
 * Registers how a store drops what belongs to the open connection. Each store holding such state
 * registers when its module loads, so a store that never loaded has nothing to drop.
 */
export const onConnectionReset = (reset: () => void) => {
	resets.push(reset);
};

/** Runs every registered reset; called when this tab switches to another connection. */
export const resetConnectionState = () => {
	for (const reset of resets) reset();
};
