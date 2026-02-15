import { HTTPException } from "hono/http-exception";
import type { DatabaseSchemaType, TableNameSchemaType } from "shared/types";
import { getDbPool } from "@/db-manager.js";

interface ColumnInfo {
	column_name: string;
	data_type: string;
	udt_name: string;
	is_nullable: string;
	column_default: string | null;
	character_maximum_length: number | null;
	numeric_precision: number | null;
	numeric_scale: number | null;
}

interface ConstraintInfo {
	constraint_name: string;
	constraint_type: string;
	column_name: string;
	foreign_table_name: string | null;
	foreign_column_name: string | null;
}

interface IndexInfo {
	indexname: string;
	indexdef: string;
}

export async function getTableSchema({
	tableName,
	db,
}: {
	tableName: TableNameSchemaType["tableName"];
	db: DatabaseSchemaType["db"];
}): Promise<string> {
	const pool = getDbPool(db);

	// Check if table exists
	const tableExistsQuery = `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.tables 
			WHERE table_schema = 'public' AND table_name = $1
		) as exists
	`;
	const { rows: tableExistsRows } = await pool.query(tableExistsQuery, [tableName]);
	if (!tableExistsRows[0]?.exists) {
		throw new HTTPException(404, {
			message: `Table "${tableName}" does not exist`,
		});
	}

	// Get column information
	const columnsQuery = `
		SELECT 
			column_name,
			data_type,
			udt_name,
			is_nullable,
			column_default,
			character_maximum_length,
			numeric_precision,
			numeric_scale
		FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = $1
		ORDER BY ordinal_position
	`;
	const { rows: columns } = await pool.query<ColumnInfo>(columnsQuery, [tableName]);

	// Get constraints (primary keys, foreign keys, unique)
	const constraintsQuery = `
		SELECT 
			tc.constraint_name,
			tc.constraint_type,
			kcu.column_name,
			ccu.table_name AS foreign_table_name,
			ccu.column_name AS foreign_column_name
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage kcu
			ON tc.constraint_name = kcu.constraint_name
			AND tc.table_schema = kcu.table_schema
		LEFT JOIN information_schema.constraint_column_usage ccu
			ON tc.constraint_name = ccu.constraint_name
			AND tc.table_schema = ccu.table_schema
			AND tc.constraint_type = 'FOREIGN KEY'
		WHERE tc.table_schema = 'public' AND tc.table_name = $1
		ORDER BY tc.constraint_type, tc.constraint_name
	`;
	const { rows: constraints } = await pool.query<ConstraintInfo>(constraintsQuery, [
		tableName,
	]);

	// Get indexes (excluding primary key indexes which are auto-created)
	const indexesQuery = `
		SELECT indexname, indexdef
		FROM pg_indexes
		WHERE schemaname = 'public' AND tablename = $1
		AND indexname NOT IN (
			SELECT constraint_name 
			FROM information_schema.table_constraints 
			WHERE table_schema = 'public' AND table_name = $1 AND constraint_type = 'PRIMARY KEY'
		)
	`;
	const { rows: indexes } = await pool.query<IndexInfo>(indexesQuery, [tableName]);

	// Build the CREATE TABLE statement
	const schemaLines: string[] = [];
	schemaLines.push(`create table public.${tableName} (`);

	// Add columns
	const columnDefs: string[] = [];
	for (const col of columns) {
		let colDef = `  ${col.column_name} ${formatDataType(col)}`;

		if (col.is_nullable === "NO") {
			colDef += " not null";
		}

		if (col.column_default !== null) {
			colDef += ` default ${col.column_default}`;
		}

		columnDefs.push(colDef);
	}

	// Group constraints by name to handle composite keys
	const constraintMap = new Map<string, ConstraintInfo[]>();
	for (const constraint of constraints) {
		const existing = constraintMap.get(constraint.constraint_name) || [];
		existing.push(constraint);
		constraintMap.set(constraint.constraint_name, existing);
	}

	// Add constraints
	const constraintDefs: string[] = [];
	for (const [constraintName, constraintColumns] of constraintMap) {
		const firstConstraint = constraintColumns[0];
		const columnNames = constraintColumns.map((c) => c.column_name).join(", ");

		if (firstConstraint.constraint_type === "PRIMARY KEY") {
			constraintDefs.push(`  constraint ${constraintName} primary key (${columnNames})`);
		} else if (firstConstraint.constraint_type === "FOREIGN KEY") {
			const foreignTable = firstConstraint.foreign_table_name;
			const foreignColumn = firstConstraint.foreign_column_name;
			constraintDefs.push(
				`  constraint ${constraintName} foreign key (${columnNames}) references ${foreignTable} (${foreignColumn})`,
			);
		} else if (firstConstraint.constraint_type === "UNIQUE") {
			constraintDefs.push(`  constraint ${constraintName} unique (${columnNames})`);
		}
	}

	// Combine column and constraint definitions
	const allDefs = [...columnDefs, ...constraintDefs];
	schemaLines.push(allDefs.join(",\n"));

	schemaLines.push(") tablespace pg_default;");

	// Add indexes as separate statements
	for (const index of indexes) {
		// Skip unique indexes that are already covered by unique constraints
		const isUniqueConstraint = Array.from(constraintMap.values()).some(
			(c) => c[0].constraint_type === "UNIQUE" && c[0].constraint_name === index.indexname,
		);
		if (!isUniqueConstraint) {
			schemaLines.push("");
			schemaLines.push(`${index.indexdef};`);
		}
	}

	return schemaLines.join("\n");
}

function formatDataType(col: ColumnInfo): string {
	const { data_type, udt_name, character_maximum_length, numeric_precision, numeric_scale } =
		col;

	// Handle user-defined types (enums)
	if (data_type === "USER-DEFINED") {
		return udt_name;
	}

	// Handle array types
	if (data_type === "ARRAY") {
		return `${udt_name.replace(/^_/, "")}[]`;
	}

	// Handle character types with length
	if (
		(data_type === "character varying" || data_type === "varchar") &&
		character_maximum_length
	) {
		return `varchar(${character_maximum_length})`;
	}

	if (data_type === "character" && character_maximum_length) {
		return `char(${character_maximum_length})`;
	}

	// Handle numeric with precision and scale
	if (data_type === "numeric" && numeric_precision !== null) {
		if (numeric_scale !== null && numeric_scale > 0) {
			return `numeric(${numeric_precision}, ${numeric_scale})`;
		}
		return `numeric(${numeric_precision})`;
	}

	// Handle timestamp types
	if (data_type === "timestamp with time zone") {
		return "timestamp with time zone";
	}

	if (data_type === "timestamp without time zone") {
		return "timestamp";
	}

	// Map common data types
	const typeMap: Record<string, string> = {
		"character varying": "varchar",
		character: "char",
		"double precision": "float8",
		integer: "integer",
		bigint: "bigint",
		smallint: "smallint",
		boolean: "boolean",
		text: "text",
		uuid: "uuid",
		json: "json",
		jsonb: "jsonb",
		date: "date",
		time: "time",
		bytea: "bytea",
	};

	return typeMap[data_type] || data_type;
}
