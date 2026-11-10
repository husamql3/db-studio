import type { TableRecord } from "@/features/tables/table.type";

export const stableStringify = (value: unknown): string => {
	if (value === undefined) return "undefined";

	if (value === null || typeof value !== "object") return JSON.stringify(value);

	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

	const record = value as Record<string, unknown>;

	return `{${Object.keys(record)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
		.join(",")}}`;
};

/** What identifies a row: its key columns' values, else its `id` or `_id`, else the whole row. */
export const getRowIdentity = (row: TableRecord, keyColumns: string[]) =>
	keyColumns.length > 0 ? keyColumns.map((column) => row[column]) : (row.id ?? row._id ?? row);

/**
 * The row's identity as a string: the grid's row id, and the key of its drafts and diffs. Keeps
 * each value's type, so a MongoDB `_id` of 1 and one of "1" stay two rows.
 */
export const getRecordKey = (row: TableRecord, keyColumns: string[] = []): string =>
	stableStringify(getRowIdentity(row, keyColumns));

const isValueEqual = (a: unknown, b: unknown): boolean => {
	if (a === b) return true;

	if (typeof a === "object" && typeof b === "object" && a !== null && b !== null) {
		return stableStringify(a) === stableStringify(b);
	}

	return false;
};

export interface TableDiffResult {
	hasVisibleChanges: boolean;
	insertedRowIds: string[];
	changedCellKeys: string[];
}

export const diffTableRows = (
	prevRows: TableRecord[] | null | undefined,
	nextRows: TableRecord[] | null | undefined,
	primaryKeyCols: string[] = [],
): TableDiffResult => {
	if (!prevRows || !nextRows) {
		return {
			hasVisibleChanges: false,
			insertedRowIds: [],
			changedCellKeys: [],
		};
	}

	const prevKeys = prevRows.map((r) => getRecordKey(r, primaryKeyCols));
	const nextKeys = nextRows.map((r) => getRecordKey(r, primaryKeyCols));

	let hasVisibleChanges = false;

	if (prevRows.length !== nextRows.length) {
		hasVisibleChanges = true;
	} else if (prevKeys.some((k, i) => k !== nextKeys[i])) {
		hasVisibleChanges = true;
	}

	const prevMap = new Map<string, TableRecord>();

	for (let i = 0; i < prevRows.length; i++) {
		prevMap.set(prevKeys[i], prevRows[i]);
	}

	const nextKeySet = new Set(nextKeys);
	const insertedRowIds: string[] = [];
	const changedCellKeys: string[] = [];

	for (let i = 0; i < nextRows.length; i++) {
		const key = nextKeys[i];
		const nextRow = nextRows[i];
		const prevRow = prevMap.get(key);

		if (!prevRow) {
			insertedRowIds.push(key);
			hasVisibleChanges = true;
		} else {
			const allCols = new Set([...Object.keys(prevRow), ...Object.keys(nextRow)]);

			for (const col of allCols) {
				if (!isValueEqual(prevRow[col], nextRow[col])) {
					changedCellKeys.push(`${key}:${col}`);
					hasVisibleChanges = true;
				}
			}
		}
	}

	for (const prevKey of prevKeys) {
		if (!nextKeySet.has(prevKey)) {
			hasVisibleChanges = true;
			break;
		}
	}

	return {
		hasVisibleChanges,
		insertedRowIds,
		changedCellKeys,
	};
};
