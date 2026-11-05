import type { CursorData, SortDirection, SortType } from "@db-studio/shared/types";

/**
 * One ORDER BY term. `raw` marks an SQL expression, such as Oracle's ROWID or a ClickHouse
 * sorting key, instead of a column name. `notNull` marks a key column, which holds no NULLs.
 */
export interface OrderTerm {
	column: string;
	direction: SortDirection;
	raw?: true;
	notNull?: true;
}

/**
 * The requested sorts, then every key not already sorted on, as tie-breakers in the leading
 * sort's direction (`order` when nothing is sorted), so every row has one place in the order.
 */
export function orderTerms(
	sorts: SortType[],
	order: SortDirection,
	keys: Array<string | { raw: string }>,
): OrderTerm[] {
	const direction = sorts[0]?.direction ?? order;

	return [
		...sorts.map((s) => ({ column: s.columnName, direction: s.direction })),
		...keys.flatMap((key): OrderTerm[] => {
			if (typeof key !== "string") return [{ column: key.raw, direction, raw: true }];

			return sorts.some((s) => s.columnName === key)
				? []
				: [{ column: key, direction, notNull: true }];
		}),
	];
}

const sqlOf = (term: OrderTerm, quote: (name: string) => string) =>
	term.raw ? term.column : quote(term.column);

export const encodeCursor = (data: CursorData) =>
	Buffer.from(JSON.stringify(data)).toString("base64url");

/** The cursor's data, or null when it is malformed. */
export const decodeCursor = (cursor: string): CursorData | null => {
	try {
		return JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
	} catch {
		return null;
	}
};

/** For OFFSET pagination: each term in its own direction; "" without terms. */
export const offsetOrderBy = (terms: OrderTerm[], quote: (name: string) => string) =>
	terms.length
		? `ORDER BY ${terms.map((t) => `${sqlOf(t, quote)} ${t.direction.toUpperCase()}`).join(", ")}`
		: "";

export const offsetOf = (cursor: string | undefined) =>
	cursor ? Number(decodeCursor(cursor)?.values._offset ?? 0) : 0;

const offsetCursor = (offset: number) =>
	encodeCursor({ values: { _offset: offset }, sortColumns: ["_offset"] });

/** A page read with `OFFSET offset … LIMIT limit + 1`: the extra row tells another page follows. */
export function offsetPage<T>(fetched: T[], offset: number, limit: number) {
	const hasMore = fetched.length > limit;

	return {
		rows: fetched.slice(0, limit),
		hasNextPage: hasMore,
		hasPreviousPage: offset > 0,
		nextCursor: hasMore ? offsetCursor(offset + limit) : null,
		prevCursor: offset > 0 ? offsetCursor(Math.max(0, offset - limit)) : null,
	};
}

export interface KeysetDialect {
	quote: (name: string) => string;
	/** How NULLs are placed: `NULLS LAST`, or ordering by `col IS NULL` first where that syntax is missing (MySQL). */
	nulls: "keyword" | "is-null";
}

/** NULLs sort last in either direction; a backward page reads that order reversed. */
const placement = (term: OrderTerm, backward: boolean) => ({
	descending: (term.direction === "desc") !== backward,
	nullsLast: !backward,
});

/** "" without terms. */
export function keysetOrderBy(terms: OrderTerm[], backward: boolean, dialect: KeysetDialect) {
	if (!terms.length) return "";

	return `ORDER BY ${terms
		.map((term) => {
			const col = sqlOf(term, dialect.quote);
			const { descending, nullsLast } = placement(term, backward);
			const order = `${col} ${descending ? "DESC" : "ASC"}`;

			if (term.notNull) return order;

			return dialect.nulls === "keyword"
				? `${order} NULLS ${nullsLast ? "LAST" : "FIRST"}`
				: `${col} IS NULL ${nullsLast ? "ASC" : "DESC"}, ${order}`;
		})
		.join(", ")}`;
}

/**
 * Rows after the `cursor` row in `keysetOrderBy(terms, backward)` order:
 * `(c1 after v1) OR (c1 = v1 AND c2 after v2) OR …`, where "after" follows each column's own
 * direction and NULL placement. A row-value comparison `(c1, c2) > (v1, v2)` cannot express
 * mixed directions and never matches NULL. Values are bound in the order they appear.
 */
export function keysetPredicate(
	terms: OrderTerm[],
	cursor: Record<string, unknown>,
	backward: boolean,
	bind: (value: unknown) => string,
	{ quote }: KeysetDialect,
): string {
	const branches: string[] = [];

	terms.forEach((term, i) => {
		const value = cursor[term.column] ?? null;
		const col = sqlOf(term, quote);
		const { descending, nullsLast } = placement(term, backward);
		const nullable = !term.notNull;

		// A NULL comes after every value when NULLs are last, so nothing follows it here.
		if (value === null && nullsLast) return;

		const equal = terms.slice(0, i).map((previous) => {
			const previousValue = cursor[previous.column] ?? null;
			const previousCol = sqlOf(previous, quote);

			return previousValue === null
				? `${previousCol} IS NULL`
				: `${previousCol} = ${bind(previousValue)}`;
		});

		const after =
			value === null
				? `${col} IS NOT NULL`
				: `${col} ${descending ? "<" : ">"} ${bind(value)}${nullable && nullsLast ? ` OR ${col} IS NULL` : ""}`;

		branches.push(`(${[...equal, `(${after})`].join(" AND ")})`);
	});

	return branches.length ? `(${branches.join(" OR ")})` : "FALSE";
}

/**
 * A page read with `LIMIT limit + 1` in `keysetOrderBy(terms, backward)` order, put back in
 * display order, with the cursors of its first and last rows. Without terms there is no order
 * to continue from, so no cursors.
 */
export function keysetPage<T extends Record<string, unknown>>(
	fetched: T[],
	{
		limit,
		cursor,
		backward,
		terms,
	}: { limit: number; cursor?: string; backward: boolean; terms: OrderTerm[] },
) {
	const hasMore = fetched.length > limit;
	const rows = fetched.slice(0, limit);

	if (backward) rows.reverse();

	const columns = terms.map((t) => t.column);

	const cursorOf = (row: T | undefined) =>
		row && columns.length
			? encodeCursor({
					values: Object.fromEntries(columns.map((col) => [col, row[col]])),
					sortColumns: columns,
				})
			: null;

	const [first, last] = [rows[0], rows.at(-1)];

	return {
		rows,
		hasNextPage: backward ? !!cursor : hasMore,
		hasPreviousPage: backward ? hasMore : !!cursor,
		nextCursor: (backward ? !!cursor : hasMore) ? cursorOf(last) : null,
		prevCursor: (backward ? hasMore : !!cursor) ? cursorOf(first) : null,
	};
}
