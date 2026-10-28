const MINUTE = 60_000;

/** "just now", "5m ago", "2h ago", "3d ago". */
export const formatLastUsed = (at: number, now = Date.now()): string => {
	const minutes = Math.round((now - at) / MINUTE);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.round(hours / 24)}d ago`;
};
