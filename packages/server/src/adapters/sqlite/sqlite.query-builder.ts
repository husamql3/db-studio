import { DataTypes, StandardizedDataType } from "@db-studio/shared/types";
import type { FilterDialect } from "@/adapters/sql-filters.js";
import type { KeysetDialect } from "@/adapters/sql-pagination.js";

export const quoteSqliteIdent = (name: string) => `"${name.replaceAll('"', '""')}"`;

export const sqliteFilters: FilterDialect = {
	quote: quoteSqliteIdent,
	likeOperand: (column) => `CAST(${column} AS TEXT)`,
	ilike: "nocase",
};

export const sqliteKeyset: KeysetDialect = { quote: quoteSqliteIdent, nulls: "keyword" };

const CLOSING_QUOTE: Record<string, string> = { "'": "'", '"': '"', "`": "`", "[": "]" };

/** Index just past any leading whitespace and comments. */
function skipTrivia(sql: string, from: number): number {
	let i = from;

	while (i < sql.length) {
		if (/\s/.test(sql[i])) i++;
		else if (sql.startsWith("--", i)) {
			const end = sql.indexOf("\n", i);
			i = end === -1 ? sql.length : end + 1;
		} else if (sql.startsWith("/*", i)) {
			const end = sql.indexOf("*/", i + 2);
			i = end === -1 ? sql.length : end + 2;
		} else break;
	}

	return i;
}

/**
 * True when `sql` holds more than one statement. Quotes, comments, trailing `;` and the
 * `BEGIN ... END` body of a CREATE TRIGGER (where `;` separates the body's statements) are ignored.
 */
export function hasMultipleStatements(sql: string): boolean {
	let words: string[] = [];
	let depth = 0;
	let sawTerminator = false;
	let i = skipTrivia(sql, 0);

	while (i < sql.length) {
		const ch = sql[i];

		if (ch === ";") {
			if (depth === 0) {
				sawTerminator = true;
				words = [];
			}

			i = skipTrivia(sql, i + 1);
			continue;
		}

		if (sawTerminator) return true;
		const close = CLOSING_QUOTE[ch];

		if (close) {
			const end = sql.indexOf(close, i + 1);
			i = end === -1 ? sql.length : end + 1;
		} else if (/[A-Za-z_]/.test(ch)) {
			const word = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(sql.slice(i))?.[0] ?? ch;
			const upper = word.toUpperCase();

			const isTrigger =
				words[0] === "CREATE" &&
				(words[1] === "TRIGGER" ||
					((words[1] === "TEMP" || words[1] === "TEMPORARY") && words[2] === "TRIGGER"));

			if (isTrigger && (upper === "BEGIN" || (depth > 0 && upper === "CASE"))) depth++;
			else if (depth > 0 && upper === "END") depth--;

			if (words.length < 3) words.push(upper);
			i += word.length;
		} else i++;
		i = skipTrivia(sql, i);
	}

	return false;
}

const TRANSACTION_CONTROL =
	/^(begin|start\s+transaction|commit|end|rollback|savepoint|release)\b/i;

/** True when `sql`, ignoring leading comments, is only a transaction-control statement. */
export function isTransactionControl(sql: string): boolean {
	return TRANSACTION_CONTROL.test(sql.slice(skipTrivia(sql, 0)));
}

/** Index just past the quoted string or identifier opening at `from`; a doubled quote escapes. */
function skipQuoted(sql: string, from: number): number {
	const close = CLOSING_QUOTE[sql[from]];
	let i = from + 1;

	while (i < sql.length) {
		if (sql[i] !== close) i++;
		else if (close !== "]" && sql[i + 1] === close) i += 2;
		else return i + 1;
	}

	return i;
}

/** `word` is the upper-cased text of a bare word; quoted names, strings and `(...)` have none. */
type Token = { text: string; word?: string };

/** Top-level tokens of `sql`; a parenthesized group, with everything inside it, is one token. */
function tokenize(sql: string): Token[] {
	const tokens: Token[] = [];
	let i = skipTrivia(sql, 0);

	while (i < sql.length) {
		const start = i;

		if (CLOSING_QUOTE[sql[i]]) i = skipQuoted(sql, i);
		else if (sql[i] === "(") {
			let depth = 0;

			do {
				if (CLOSING_QUOTE[sql[i]]) {
					i = skipQuoted(sql, i);
					continue;
				}

				if (sql.startsWith("--", i) || sql.startsWith("/*", i)) {
					i = skipTrivia(sql, i);
					continue;
				}

				if (sql[i] === "(") depth++;
				else if (sql[i] === ")") depth--;
				i++;
			} while (depth > 0 && i < sql.length);
		} else if (sql[i] === "," || sql[i] === ")") i++;
		else {
			while (i < sql.length && !/[\s,()'"`[]/.test(sql[i])) i++;
		}

		const text = sql.slice(start, i);
		tokens.push(/^[^,()'"`[]/.test(text) ? { text, word: text.toUpperCase() } : { text });
		i = skipTrivia(sql, i);
	}

	return tokens;
}

const unquote = (text: string) =>
	CLOSING_QUOTE[text[0]]
		? text
				.slice(1, -1)
				.replaceAll(
					`${CLOSING_QUOTE[text[0]]}${CLOSING_QUOTE[text[0]]}`,
					CLOSING_QUOTE[text[0]],
				)
		: text;

const TABLE_CONSTRAINTS = new Set(["CONSTRAINT", "PRIMARY", "UNIQUE", "CHECK", "FOREIGN"]);

const COLUMN_RULES = new Set([
	"CONSTRAINT",
	"PRIMARY",
	"NOT",
	"NULL",
	"UNIQUE",
	"CHECK",
	"DEFAULT",
	"COLLATE",
	"REFERENCES",
	"GENERATED",
	"AS",
]);

const REPLACED_RULES = new Set(["NOT", "NULL", "DEFAULT"]);

/**
 * The column's rules split at each rule keyword. NULL and DEFAULT after SET and NOT before
 * DEFERRABLE belong to a REFERENCES clause, not a rule of their own.
 */
function splitRules(tokens: Token[]): Token[][] {
	const rules: Token[][] = [];
	tokens.forEach((token, i) => {
		const starts =
			token.word !== undefined &&
			COLUMN_RULES.has(token.word) &&
			!(
				tokens[i - 1]?.word === "SET" &&
				(token.word === "NULL" || token.word === "DEFAULT")
			) &&
			!(token.word === "NOT" && tokens[i + 1]?.word === "DEFERRABLE");

		if (starts || rules.length === 0) rules.push([token]);
		else rules[rules.length - 1].push(token);
	});

	return rules;
}

/**
 * `createSql`, a table's CREATE TABLE from sqlite_master, rewritten to create `newName` with
 * column `columnName` given `type`, `notNull` and `defaultValue`. Everything else is kept as
 * written: other columns, table constraints, the column's own UNIQUE, CHECK, COLLATE,
 * REFERENCES and PRIMARY KEY, generated columns and WITHOUT ROWID or STRICT. Null when the
 * statement cannot be read or names the column other than once.
 */
export function recreateTableWithColumn(
	createSql: string,
	newName: string,
	columnName: string,
	change: { type: string; notNull: boolean; defaultValue: string | null },
): string | null {
	const tokens = tokenize(createSql);
	const bodyIndex = tokens.findIndex((token) => token.text.startsWith("("));

	if (tokens[0]?.word !== "CREATE" || tokens[1]?.word !== "TABLE" || bodyIndex === -1)
		return null;

	const items: Token[][] = [[]];

	for (const token of tokenize(tokens[bodyIndex].text.slice(1, -1))) {
		if (token.text === ",") items.push([]);
		else items[items.length - 1].push(token);
	}

	let matches = 0;

	const definitions = items.map((item) => {
		const [name, ...rest] = item;
		const isColumn = name && !(name.word && TABLE_CONSTRAINTS.has(name.word));

		if (!isColumn || unquote(name.text).toLowerCase() !== columnName.toLowerCase()) {
			return item.map((token) => token.text).join(" ");
		}

		matches++;
		const firstRule = rest.findIndex((token) => token.word && COLUMN_RULES.has(token.word));
		const kept: Token[][] = [];

		for (const rule of splitRules(firstRule === -1 ? [] : rest.slice(firstRule))) {
			if (rule[0].word && REPLACED_RULES.has(rule[0].word)) {
				// A `CONSTRAINT name` prefix belongs to the rule being replaced.
				if (kept.at(-1)?.[0].word === "CONSTRAINT") kept.pop();
			} else kept.push(rule);
		}

		return [
			name.text,
			change.type,
			...kept.flat().map((token) => token.text),
			...(change.notNull ? ["NOT NULL"] : []),
			...(change.defaultValue ? [`DEFAULT ${change.defaultValue}`] : []),
		].join(" ");
	});

	if (matches !== 1) return null;

	const options = tokens.slice(bodyIndex + 1).map((token) => token.text);

	return [
		`CREATE TABLE ${quoteSqliteIdent(newName)} (${definitions.join(", ")})`,
		...options,
	].join(" ");
}

/**
 * Maps SQLite type affinity strings to generic DataTypes (used for cell rendering).
 * SQLite has flexible typing — column types are user-declared strings, so we use affinity rules.
 */
export function mapSqliteToDataType(sqliteType: string): DataTypes {
	const normalized = sqliteType?.toLowerCase().trim() || "";

	if (normalized === "boolean" || normalized === "bool") return DataTypes.boolean;

	if (normalized === "json") return DataTypes.json;

	if (
		normalized === "date" ||
		normalized === "datetime" ||
		normalized === "timestamp" ||
		normalized === "time"
	) {
		return DataTypes.date;
	}

	// SQLite integer affinity: any type name containing "INT"
	if (
		normalized.includes("int") ||
		normalized === "real" ||
		normalized.includes("floa") ||
		normalized.includes("doub") ||
		normalized === "numeric" ||
		normalized.startsWith("numeric(") ||
		normalized === "decimal" ||
		normalized.startsWith("decimal(")
	) {
		return DataTypes.number;
	}

	return DataTypes.text;
}

export function standardizeSqliteDataTypeLabel(sqliteType: string): StandardizedDataType {
	const normalized = sqliteType?.toLowerCase().trim() || "";

	if (normalized === "integer" || normalized === "int") return StandardizedDataType.int;

	if (normalized === "bigint" || normalized.startsWith("bigint("))
		return StandardizedDataType.bigint;

	if (normalized === "smallint" || normalized.startsWith("smallint("))
		return StandardizedDataType.smallint;

	if (normalized === "tinyint" || normalized.startsWith("tinyint("))
		return StandardizedDataType.tinyint;

	if (normalized === "mediumint" || normalized.startsWith("mediumint("))
		return StandardizedDataType.mediumint;

	if (normalized.includes("int")) return StandardizedDataType.int;

	if (normalized === "real" || normalized === "float" || normalized.startsWith("float("))
		return StandardizedDataType.float;

	if (
		normalized === "double" ||
		normalized === "double precision" ||
		normalized.startsWith("double(")
	)
		return StandardizedDataType.double;

	if (
		normalized === "numeric" ||
		normalized.startsWith("numeric(") ||
		normalized === "decimal" ||
		normalized.startsWith("decimal(")
	) {
		return StandardizedDataType.numeric;
	}

	if (normalized === "boolean" || normalized === "bool") return StandardizedDataType.boolean;

	if (normalized === "text" || normalized === "clob") return StandardizedDataType.text;

	if (normalized === "varchar" || normalized.startsWith("varchar("))
		return StandardizedDataType.varchar;

	if (normalized === "char" || normalized.startsWith("char("))
		return StandardizedDataType.char;

	if (normalized === "json") return StandardizedDataType.json;

	if (normalized === "date") return StandardizedDataType.date;

	if (normalized === "time") return StandardizedDataType.time;

	if (normalized === "datetime") return StandardizedDataType.datetime;

	if (normalized === "timestamp") return StandardizedDataType.timestamp;

	if (normalized === "blob") return StandardizedDataType.blob;

	return StandardizedDataType.text;
}
