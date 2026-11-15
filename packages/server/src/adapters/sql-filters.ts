import type { FilterType } from "@db-studio/shared/types";

/** How one engine writes the grid's filter conditions. */
export interface FilterDialect {
	quote: (name: string) => string;
	/** The column as LIKE sees it, e.g. cast to text. `column` is already quoted. */
	likeOperand?: (column: string, columnName: string) => string;
	/**
	 * How ILIKE is written: the `ILIKE` keyword, LIKE with `COLLATE NOCASE`, LIKE over
	 * `UPPER()` of both sides, or plain LIKE where the collation already ignores case.
	 */
	ilike: "keyword" | "nocase" | "upper" | "like";
	/** The placeholder for a comparison value; Oracle converts it by the column's type. */
	bindComparison?: (value: string, columnName: string) => string;
}

const COMPARISONS = new Set(["=", "!=", ">", ">=", "<", "<="]);

/** One condition per filter; unknown operators are skipped. Values go through `bind`. */
export function buildFilterConditions(
	filters: FilterType[],
	bind: (value: string) => string,
	dialect: FilterDialect,
): string[] {
	const bindComparison = dialect.bindComparison ?? bind;

	return filters.flatMap(({ columnName, operator, value }) => {
		const col = dialect.quote(columnName);
		const isNull = value.toLowerCase() === "null";

		if (COMPARISONS.has(operator))
			return [`${col} ${operator} ${bindComparison(value, columnName)}`];

		if (operator === "is")
			return [isNull ? `${col} IS NULL` : `${col} = ${bindComparison(value, columnName)}`];

		if (operator === "is not")
			return [
				isNull ? `${col} IS NOT NULL` : `${col} != ${bindComparison(value, columnName)}`,
			];

		const like = /^(not )?(i)?like$/.exec(operator);

		if (!like) return [];

		const operand = dialect.likeOperand?.(col, columnName) ?? col;
		const not = like[1] ? "NOT " : "";

		if (!like[2] || dialect.ilike === "like") return [`${operand} ${not}LIKE ${bind(value)}`];

		switch (dialect.ilike) {
			case "keyword":
				return [`${operand} ${not}ILIKE ${bind(value)}`];
			case "nocase":
				return [`${operand} ${not}LIKE ${bind(value)} COLLATE NOCASE`];
			case "upper":
				return [`UPPER(${operand}) ${not}LIKE UPPER(${bind(value)})`];
		}
	});
}

export const whereSql = (conditions: string[]) =>
	conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

/** Collects bound values in order; `placeholder(n)` writes the n-th one, counting from 1. */
export const createBinds = (placeholder: (position: number) => string) => {
	const values: unknown[] = [];

	const bind = (value: unknown) => {
		values.push(value);

		return placeholder(values.length);
	};

	return { values, bind };
};
