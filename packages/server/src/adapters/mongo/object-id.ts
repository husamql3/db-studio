import type { ObjectId } from "mongodb";
import { loadedDriver } from "@/drivers.js";

/** A string that is a valid ObjectId becomes one; anything else stays as it is. */
export const coerceObjectId = <T>(value: T): T | ObjectId => {
	const { ObjectId } = loadedDriver("mongodb");

	return typeof value === "string" && ObjectId.isValid(value) ? new ObjectId(value) : value;
};
