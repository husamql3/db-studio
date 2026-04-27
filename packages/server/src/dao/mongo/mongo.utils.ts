import type { DataTypes, FilterType, SortType, TableDataQuerySchemaType } from "shared/types";
import { coerceObjectId, isValidObjectId } from "@/db-manager.js";

const normalizeValue = (value: unknown): unknown => {
	if (value instanceof Date) {
		return value.toISOString();
	}
	if (typeof value === "bigint") {
		return value.toString();
	}
	if (value && typeof value === "object") {
		if ("_bsontype" in value && (value as { _bsontype?: string })._bsontype === "ObjectId") {
			return (value as { toHexString: () => string }).toHexString();
		}
		if (Array.isArray(value)) {
			return value.map((item) => normalizeValue(item));
		}
		const entries = Object.entries(value as Record<string, unknown>).map(([k, v]) => [
			k,
			normalizeValue(v),
		]);
		return Object.fromEntries(entries);
	}
	return value;
};

const inferDataType = (value: unknown): DataTypes => {
	if (value instanceof Date) return "date";
	if (value && typeof value === "object") {
		if (Array.isArray(value)) return "array";
		if ("_bsontype" in value) return "text";
		return "json";
	}
	if (typeof value === "boolean") return "boolean";
	if (typeof value === "number" || typeof value === "bigint") return "number";
	return "text";
};

const mapDataTypeLabel = (dataType: DataTypes): string => {
	switch (dataType) {
		case "number":
			return "numeric";
		case "boolean":
			return "boolean";
		case "json":
			return "json";
		case "date":
			return "date";
		case "array":
			return "array";
		case "enum":
			return "enum";
		default:
			return "text";
	}
};

const buildMongoFilters = (filters: FilterType[]): Record<string, unknown> => {
	if (!filters || filters.length === 0) return {};
	const andConditions: Record<string, unknown>[] = [];
	const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const parseValue = (raw: string) => {
		const trimmed = raw.trim();
		if (trimmed === "null") return null;
		if (trimmed === "true") return true;
		if (trimmed === "false") return false;
		const asNumber = Number(trimmed);
		if (!Number.isNaN(asNumber) && trimmed !== "") return asNumber;
		if (isValidObjectId(trimmed)) return coerceObjectId(trimmed);
		return trimmed;
	};

	for (const filter of filters) {
		const field = filter.columnName;
		const value = parseValue(filter.value);
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
				andConditions.push({
					[field]: {
						$regex: escapeRegex(String(value)),
						$options: "",
					},
				});
				break;
			case "not like":
				andConditions.push({
					[field]: {
						$not: { $regex: escapeRegex(String(value)), $options: "" },
					},
				});
				break;
			case "ilike":
				andConditions.push({
					[field]: {
						$regex: escapeRegex(String(value)),
						$options: "i",
					},
				});
				break;
			case "not ilike":
				andConditions.push({
					[field]: {
						$not: { $regex: escapeRegex(String(value)), $options: "i" },
					},
				});
				break;
			default:
				andConditions.push({ [field]: value });
				break;
		}
	}

	return andConditions.length ? { $and: andConditions } : {};
};

const buildMongoSort = (
	sort: TableDataQuerySchemaType["sort"],
	order?: TableDataQuerySchemaType["order"],
): Record<string, 1 | -1> => {
	if (!sort) return { _id: 1 };

	if (Array.isArray(sort)) {
		const sortEntries = (sort as SortType[]).map((s) => [
			s.columnName,
			s.direction === "desc" ? -1 : 1,
		]);
		return Object.fromEntries(sortEntries);
	}

	if (typeof sort === "string" && sort.length > 0) {
		return { [sort]: order === "desc" ? -1 : 1 };
	}

	return { _id: 1 };
};

export {
	buildMongoFilters,
	buildMongoSort,
	canCoerceObjectId,
	coerceObjectId as toMongoId,
	inferDataType,
	mapDataTypeLabel,
	normalizeValue as normalizeMongoDocument,
};

function canCoerceObjectId(value: unknown): boolean {
	return typeof value === "string" && isValidObjectId(value);
}
