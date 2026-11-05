import type { z } from "zod";

/** A page cursor: its fields as base64url JSON. */
export const encodeCursor = <T>(data: T): string =>
	Buffer.from(JSON.stringify(data)).toString("base64url");

/** The fields of a cursor `encodeCursor` made, or null when it is malformed or not `schema`. */
export const decodeCursor = <T>(cursor: string, schema: z.ZodType<T>): T | null => {
	try {
		return schema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
	} catch {
		return null;
	}
};
