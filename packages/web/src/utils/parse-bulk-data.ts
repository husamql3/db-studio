/**
 * Parse bulk data from CSV or JSON string
 * Supports CSV (comma/tab/semicolon separated) and JSON formats
 */
export const parseBulkData = (input: string): Record<string, unknown>[] => {
	const trimmedInput = input.trim();

	// Try JSON first
	if (trimmedInput.startsWith("[") || trimmedInput.startsWith("{")) {
		try {
			const parsed = JSON.parse(trimmedInput);
			// Handle single object wrapped in array
			if (Array.isArray(parsed)) {
				return parsed;
			}
			if (typeof parsed === "object" && parsed !== null) {
				return [parsed];
			}
			throw new Error("Invalid JSON format");
		} catch (error) {
			if (error instanceof SyntaxError) {
				throw new Error(`Invalid JSON format: ${error.message.replace("JSON.", "")}`);
			}
			throw error;
		}
	}

	// Try CSV format
	return parseCSV(trimmedInput);
};

/**
 * Parse CSV data with automatic delimiter detection
 */
const parseCSV = (input: string): Record<string, unknown>[] => {
	const delimiter = detectDelimiter(input.split("\n", 1)[0]);
	const [headerRow, ...rows] = parseCSVRows(input, delimiter);

	if (!headerRow) {
		throw new Error("No data to parse");
	}

	const headers = headerRow.map((h) => h.trim());

	// A short or long row means a stray delimiter or quote; guessing which column moved
	// would insert values under the wrong names.
	const records = rows.map((values, i) => {
		if (values.length !== headers.length) {
			throw new Error(
				`Row ${i + 2} has ${values.length} ${values.length === 1 ? "value" : "values"} but ${headers.length} columns are expected`,
			);
		}
		return Object.fromEntries(
			headers.map((header, index) => [header, parseValue(values[index].trim())]),
		);
	});

	if (records.length === 0) {
		throw new Error("No records found in CSV");
	}

	return records;
};

/** Pre-compiled delimiter regexes for CSV detection */
const DELIMITER_REGEXES: Record<string, RegExp> = {
	",": /,/g,
	"\t": /\t/g,
	";": /;/g,
};

/**
 * Detect CSV delimiter (comma, tab, or semicolon)
 */
const detectDelimiter = (headerLine: string): string => {
	const delimiters = [",", "\t", ";"];
	let maxCount = 0;
	let detectedDelimiter = ",";

	for (const delimiter of delimiters) {
		const count = (headerLine.match(DELIMITER_REGEXES[delimiter]) || []).length;
		if (count > maxCount) {
			maxCount = count;
			detectedDelimiter = delimiter;
		}
	}

	return detectedDelimiter;
};

/**
 * Split CSV into rows of fields. A quoted field may hold the delimiter and newlines;
 * blank lines are skipped.
 */
const parseCSVRows = (input: string, delimiter: string): string[][] => {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let insideQuotes = false;

	const endRow = () => {
		row.push(field);
		if (row.length > 1 || row[0].trim() !== "") {
			rows.push(row);
		}
		row = [];
		field = "";
	};

	for (let i = 0; i < input.length; i++) {
		const char = input[i];
		if (char === '"') {
			if (insideQuotes && input[i + 1] === '"') {
				// Escaped quote
				field += '"';
				i++;
			} else {
				insideQuotes = !insideQuotes;
			}
		} else if (insideQuotes) {
			field += char;
		} else if (char === delimiter) {
			row.push(field);
			field = "";
		} else if (char === "\n") {
			endRow();
		} else if (char !== "\r") {
			field += char;
		}
	}

	if (insideQuotes) {
		throw new Error("CSV has a quoted field without a closing quote");
	}
	endRow();
	return rows;
};

/**
 * Convert string values to appropriate types
 */
const parseValue = (value: string): unknown => {
	if (value === "" || value === "null") {
		return null;
	}

	if (value === "true") {
		return true;
	}

	if (value === "false") {
		return false;
	}

	// Try to parse as number
	if (!Number.isNaN(Number(value)) && value !== "") {
		const num = Number(value);
		// Check if it's actually a number and not just a string that looks like one
		if (String(num) === value || (value.includes(".") && !Number.isNaN(parseFloat(value)))) {
			return num;
		}
	}

	// Try to parse as JSON (for arrays/objects)
	if (
		(value.startsWith("{") && value.endsWith("}")) ||
		(value.startsWith("[") && value.endsWith("]"))
	) {
		try {
			return JSON.parse(value);
		} catch {
			// Not valid JSON, return as string
		}
	}

	return value;
};
