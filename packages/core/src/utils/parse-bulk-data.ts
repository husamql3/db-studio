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
	const lines = input.split("\n").filter((line) => line.trim());

	if (lines.length < 1) {
		throw new Error("No data to parse");
	}

	// Detect delimiter
	const headerLine = lines[0];
	const delimiter = detectDelimiter(headerLine);

	const headers = parseCSVLine(headerLine, delimiter).map((h) => h.trim());

	if (headers.length === 0) {
		throw new Error("No headers found in CSV");
	}

	const records: Record<string, unknown>[] = [];

	for (let i = 1; i < lines.length; i++) {
		const values = parseCSVLine(lines[i], delimiter);

		if (values.length !== headers.length) {
			console.warn(
				`Row ${i + 1} has ${values.length} values but ${headers.length} headers expected`,
			);
		}

		const record: Record<string, unknown> = {};
		headers.forEach((header, index) => {
			const value = values[index]?.trim() ?? "";
			record[header] = parseValue(value);
		});

		records.push(record);
	}

	if (records.length === 0) {
		throw new Error("No records found in CSV");
	}

	return records;
};

/**
 * Detect CSV delimiter (comma, tab, or semicolon)
 */
const detectDelimiter = (headerLine: string): string => {
	const delimiters = [",", "\t", ";"];
	let maxCount = 0;
	let detectedDelimiter = ",";

	for (const delimiter of delimiters) {
		const count = (headerLine.match(new RegExp(`\\${delimiter}`, "g")) || []).length;
		if (count > maxCount) {
			maxCount = count;
			detectedDelimiter = delimiter;
		}
	}

	return detectedDelimiter;
};

/**
 * Parse a single CSV line respecting quotes
 */
const parseCSVLine = (line: string, delimiter: string): string[] => {
	const result: string[] = [];
	let current = "";
	let insideQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		const nextChar = line[i + 1];

		if (char === '"') {
			if (insideQuotes && nextChar === '"') {
				// Escaped quote
				current += '"';
				i++; // Skip next quote
			} else {
				// Toggle quote state
				insideQuotes = !insideQuotes;
			}
		} else if (char === delimiter && !insideQuotes) {
			result.push(current);
			current = "";
		} else {
			current += char;
		}
	}

	result.push(current);
	return result;
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
