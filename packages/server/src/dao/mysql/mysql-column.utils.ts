type MysqlColumnDefinitionInput = {
	columnName: string;
	columnType: string;
	defaultValue?: string | null;
	isPrimaryKey?: boolean;
	isNullable?: boolean;
	isUnique?: boolean;
	isIdentity?: boolean;
	isArray?: boolean;
};

type BuildMysqlColumnDefinitionOptions = {
	includePrimaryKey?: boolean;
	includeUnique?: boolean;
	preserveAutoIncrement?: boolean;
};

/**
 * Formats default values for MySQL compatibility.
 * MySQL requires function calls in DEFAULT clauses to be wrapped in parentheses.
 */
export function formatMysqlDefaultValue(
	defaultValue: string | null | undefined,
	columnType: string,
): string | null {
	if (!defaultValue?.trim()) {
		return null;
	}

	const trimmed = defaultValue.trim().toLowerCase();

	// Check if it's a function call (contains parentheses)
	if (trimmed.includes("(") && trimmed.includes(")")) {
		// MySQL 8.0+ requires function calls to be wrapped in parentheses for DEFAULT
		// But UUID() returns a string, not compatible with INT columns
		if (trimmed.includes("uuid()")) {
			// UUID() only makes sense for CHAR(36) or VARCHAR columns
			if (
				!columnType.toUpperCase().includes("CHAR") &&
				!columnType.toUpperCase().includes("TEXT")
			) {
				return null;
			}
			return "(UUID())";
		}

		// Other function calls like CURRENT_TIMESTAMP, NOW(), etc.
		if (trimmed.includes("current_timestamp") || trimmed.includes("now()")) {
			return "(CURRENT_TIMESTAMP)";
		}

		if (trimmed.includes("current_date")) {
			return "(CURRENT_DATE)";
		}

		// Wrap other function calls in parentheses
		return `(${defaultValue.trim()})`;
	}

	// For non-function defaults (literals), return as-is
	// Handle special keywords
	if (trimmed === "null") {
		return "NULL";
	}

	if (trimmed === "true" || trimmed === "false") {
		return trimmed === "true" ? "1" : "0";
	}

	// Return the value as-is (could be a number, quoted string, etc.)
	return defaultValue.trim();
}

/**
 * Maps PG-style column types from the UI schema to MySQL-compatible types.
 * The UI uses PostgreSQL-style type names, so we translate them for MySQL.
 */
export function mapColumnTypeToMysql(columnType: string, isArray: boolean): string {
	if (isArray) {
		// MySQL does not support native array types - use JSON as fallback
		return "JSON";
	}

	const normalized = columnType.toLowerCase().trim();

	const typeMap: Record<string, string> = {
		// Integer types
		serial: "INT AUTO_INCREMENT",
		serial4: "INT AUTO_INCREMENT",
		bigserial: "BIGINT AUTO_INCREMENT",
		serial8: "BIGINT AUTO_INCREMENT",
		int: "INT",
		int4: "INT",
		integer: "INT",
		bigint: "BIGINT",
		int8: "BIGINT",
		smallint: "SMALLINT",
		int2: "SMALLINT",
		// Decimal / numeric
		numeric: "DECIMAL",
		decimal: "DECIMAL",
		real: "FLOAT",
		float4: "FLOAT",
		float: "FLOAT",
		"double precision": "DOUBLE",
		float8: "DOUBLE",
		money: "DECIMAL(19, 4)",
		// Boolean
		boolean: "TINYINT(1)",
		bool: "TINYINT(1)",
		// Text
		text: "LONGTEXT",
		varchar: "VARCHAR(255)",
		"character varying": "VARCHAR(255)",
		char: "CHAR(1)",
		character: "CHAR(1)",
		bpchar: "CHAR",
		uuid: "CHAR(36)",
		// JSON
		json: "JSON",
		jsonb: "JSON",
		xml: "LONGTEXT",
		// Date/time
		date: "DATE",
		time: "TIME",
		"time without time zone": "TIME",
		timestamp: "DATETIME",
		"timestamp without time zone": "DATETIME",
		"timestamp with time zone": "DATETIME",
		timestamptz: "DATETIME",
		interval: "VARCHAR(255)",
		// Binary
		bytea: "LONGBLOB",
		// Network / geometric - store as text in MySQL
		inet: "VARCHAR(45)",
		cidr: "VARCHAR(45)",
		macaddr: "VARCHAR(17)",
		macaddr8: "VARCHAR(23)",
		point: "POINT",
		line: "LINESTRING",
		polygon: "POLYGON",
	};

	return typeMap[normalized] || columnType.toUpperCase();
}

export function buildMysqlColumnDefinition(
	field: MysqlColumnDefinitionInput,
	options: BuildMysqlColumnDefinitionOptions = {},
): string {
	const mappedType = mapColumnTypeToMysql(field.columnType, field.isArray ?? false);
	let columnDef = `\`${field.columnName}\` ${mappedType}`;

	// NOT NULL
	if (!field.isNullable && !field.isPrimaryKey) {
		columnDef += " NOT NULL";
	}

	// Default value (skip for AUTO_INCREMENT columns)
	if (field.defaultValue && !mappedType.includes("AUTO_INCREMENT")) {
		const defaultValue = formatMysqlDefaultValue(field.defaultValue, mappedType);
		if (defaultValue !== null) {
			columnDef += ` DEFAULT ${defaultValue}`;
		}
	}

	// isIdentity -> AUTO_INCREMENT (already embedded in type map via SERIAL mapping)
	if (
		(field.isIdentity || options.preserveAutoIncrement) &&
		!mappedType.includes("AUTO_INCREMENT")
	) {
		columnDef += " AUTO_INCREMENT";
	}

	if (options.includeUnique && field.isUnique && !field.isPrimaryKey) {
		columnDef += " UNIQUE";
	}

	if (options.includePrimaryKey && field.isPrimaryKey) {
		columnDef += " PRIMARY KEY";
	}

	return columnDef;
}
