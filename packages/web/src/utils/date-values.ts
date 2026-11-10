import type { StandardizedDataType } from "@db-studio/shared/types";
import { format, parseISO } from "date-fns";

const DATE_ONLY_TEXT = /^\d{4}-\d{2}-\d{2}$/;

/** Every date column but DATE carries a time of day. */
export const hasTimeOfDay = (dataTypeLabel: StandardizedDataType | undefined) =>
	dataTypeLabel !== "date";

/**
 * The value a picked date is written as. A DATE column takes the picked local day: the ISO
 * instant of local midnight is the previous day east of UTC. A zone-aware column takes the
 * instant. Any other timestamp ignores an offset, so it takes the local wall-clock time; the
 * ISO instant would shift it by the browser's offset.
 */
export const toDateValue = (date: Date, dataTypeLabel: StandardizedDataType | undefined) => {
	if (dataTypeLabel === "date") return format(date, "yyyy-MM-dd");

	if (dataTypeLabel === "timestamptz") return date.toISOString();

	return format(
		date,
		date.getMilliseconds() ? "yyyy-MM-dd HH:mm:ss.SSS" : "yyyy-MM-dd HH:mm:ss",
	);
};

/** A bare day parses as UTC midnight with `new Date`, the previous day west of UTC. */
export const parseDateValue = (value: string) =>
	DATE_ONLY_TEXT.test(value) ? parseISO(value) : new Date(value);
