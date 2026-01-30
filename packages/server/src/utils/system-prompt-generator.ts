import type { DatabaseSchema } from "shared/types";

const MINIMAL_SYSTEM_PROMPT = `You are a database assistant for db-studio. Your responses must be CONCISE and FOCUSED.
You help with general database and SQL questions. Without schema context, use generic table/column names in examples.
When generating SQL, wrap queries in \`\`\`sql code blocks. Keep responses SHORT.`;

/**
 * Generate minimal system prompt (no schema context)
 */
export function getMinimalSystemPrompt(): string {
	return MINIMAL_SYSTEM_PROMPT;
}

/**
 * Generate system prompt with database context
 */
export function generateSystemPrompt(schema: DatabaseSchema): string {
	return `You are a database assistant for db-studio. Your responses must be CONCISE and FOCUSED.

**Your Role:**
1. Keep responses SHORT - 2-3 sentences maximum unless generating SQL
2. When generating SQL:
   - Provide 1 sentence explanation
   - The SQL query in a code block
   - 1 sentence about expected results
   - NO verbose explanations
3. Use exact table/column names from the schema
4. Generate valid ${schema.dbType} syntax
5. If query is unclear, ask ONE specific clarifying question
6. No preamble, no apologies, get straight to the answer

**Database Context:**
${formatSchemaForPrompt(schema)}

**Guidelines:**
1. Always generate syntactically correct SQL for the database type (${schema.dbType})
2. Use proper table/column names exactly as defined in the schema
3. When generating queries, wrap them in \`\`\`sql code blocks
4. Explain what the query does in plain language
5. Suggest relevant follow-up questions or analyses
6. If a request is ambiguous, ask clarifying questions
7. For complex queries, break down the logic step-by-step
8. Warn about potentially expensive operations (full table scans, etc.)
9. Consider data privacy - remind users not to share sensitive data externally

**Response Format:**
When generating queries, use this structure:
- Brief explanation of what you'll do
- The SQL query in a code block
- Expected results description
- Optional: suggestions for related queries

**Example:**
User: "Show me the top 5 customers by revenue"

Response: "I'll query the orders and customers tables to find your highest-value customers.

\`\`\`sql
SELECT 
  c.customer_name,
  SUM(o.total_amount) as total_revenue
FROM customers c
JOIN orders o ON c.id = o.customer_id
GROUP BY c.id, c.customer_name
ORDER BY total_revenue DESC
LIMIT 5;
\`\`\`

This will return the 5 customers with the highest total order value. You might also want to see:
- Revenue trends over time for these customers
- Their most frequently ordered products"`;
}

/**
 * Format schema information for the prompt
 */
function formatSchemaForPrompt(schema: DatabaseSchema): string {
	let output = `Database Type: ${schema.dbType}\n\n`;

	output += "**Tables and Columns:**\n";
	for (const table of schema.tables) {
		output += `\n### ${table.name}\n`;
		if (table.description) {
			output += `Description: ${table.description}\n`;
		}
		output += "Columns:\n";

		for (const col of table.columns) {
			const pkIndicator = col.isPrimaryKey ? " [PRIMARY KEY]" : "";
			const fkIndicator = col.foreignKey ? ` [FK -> ${col.foreignKey}]` : "";
			const nullable = col.nullable ? "NULL" : "NOT NULL";

			output += `  - ${col.name}: ${col.type} ${nullable}${pkIndicator}${fkIndicator}\n`;
			if (col.description) {
				output += `    ${col.description}\n`;
			}
		}

		// Add sample data if available
		if (table.sampleData && table.sampleData.length > 0) {
			output += `Sample data (${table.sampleData.length} rows):\n`;
			output += `${JSON.stringify(table.sampleData.slice(0, 3), null, 2)}\n`;
		}
	}

	// Add relationships
	if (schema.relationships && schema.relationships.length > 0) {
		output += "\n**Relationships:**\n";
		for (const rel of schema.relationships) {
			output += `  - ${rel.fromTable}.${rel.fromColumn} -> ${rel.toTable}.${rel.toColumn}\n`;
		}
	}

	return output;
}
