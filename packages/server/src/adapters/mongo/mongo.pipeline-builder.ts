import type { FilterType, SortDirection, SortType } from "shared/types";
import { coerceObjectId, isValidObjectId } from "@/db-manager.js";

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseFilterValue = (raw: string): unknown => {
	const trimmed = raw.trim();
	if (trimmed === "null") return null;
	if (trimmed === "true") return true;
	if (trimmed === "false") return false;
	const asNumber = Number(trimmed);
	if (!Number.isNaN(asNumber) && trimmed !== "") return asNumber;
	if (isValidObjectId(trimmed)) return coerceObjectId(trimmed);
	return trimmed;
};

export function buildMatchStage(filters: FilterType[]): Record<string, unknown> {
	if (!filters || filters.length === 0) return {};
	const andConditions: Record<string, unknown>[] = [];

	for (const filter of filters) {
		const field = filter.columnName;
		const value = parseFilterValue(filter.value);
		const op = filter.operator.toLowerCase();
		if (!field) continue;

		switch (op) {
			case "=":
				andConditions.push({ [field]: value });
				break;
			case "!=":
				andConditions.push({ [field]: { $ne: value } });
				break;
			case ">":
				andConditions.push({ [field]: { $gt: value } });
				break;
			case ">=":
				andConditions.push({ [field]: { $gte: value } });
				break;
			case "<":
				andConditions.push({ [field]: { $lt: value } });
				break;
			case "<=":
				andConditions.push({ [field]: { $lte: value } });
				break;
			case "is":
				andConditions.push({ [field]: value });
				break;
			case "is not":
				andConditions.push({ [field]: { $ne: value } });
				break;
			case "like":
				andConditions.push({ [field]: { $regex: escapeRegex(String(value)), $options: "" } });
				break;
			case "not like":
				andConditions.push({
					[field]: { $not: { $regex: escapeRegex(String(value)), $options: "" } },
				});
				break;
			case "ilike":
				andConditions.push({ [field]: { $regex: escapeRegex(String(value)), $options: "i" } });
				break;
			case "not ilike":
				andConditions.push({
					[field]: { $not: { $regex: escapeRegex(String(value)), $options: "i" } },
				});
				break;
			default:
				andConditions.push({ [field]: value });
				break;
		}
	}

	return andConditions.length ? { $and: andConditions } : {};
}

export function buildSortStage(
	sort: string | SortType[] | undefined,
	order?: SortDirection,
): Record<string, 1 | -1> {
	if (!sort) return { _id: 1 };
	if (Array.isArray(sort)) {
		if (sort.length === 0) return { _id: 1 };
		return Object.fromEntries(
			sort.map((s) => [s.columnName, s.direction === "desc" ? -1 : 1]),
		);
	}
	if (typeof sort === "string" && sort.length > 0) {
		return { [sort]: order === "desc" ? -1 : 1 };
	}
	return { _id: 1 };
}

export function encodeMongoCursor(offset: number): string {
	return Buffer.from(JSON.stringify({ offset })).toString("base64url");
}

export function decodeMongoCursor(cursor?: string): number {
	if (!cursor) return 0;
	try {
		const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8")) as {
			offset?: number;
		};
		return typeof parsed.offset === "number" ? parsed.offset : 0;
	} catch {
		return 0;
	}
}
