import "dotenv/config";
import { db } from "./db.js";

async function updateUserIdToUuid() {
	console.log("Connecting to database...");

	try {
		// Check current column type
		const checkResult = await db.query(`
			SELECT column_name, data_type 
			FROM information_schema.columns 
			WHERE table_name = 'user' AND column_name = 'id'
		`);
		console.log("Current column info:", checkResult.rows[0]);

		// Find all foreign keys referencing user.id
		const fkResult = await db.query(`
			SELECT 
				tc.constraint_name,
				tc.table_name AS referencing_table,
				kcu.column_name AS referencing_column,
				ccu.table_name AS referenced_table,
				ccu.column_name AS referenced_column
			FROM information_schema.table_constraints tc
			JOIN information_schema.key_column_usage kcu
				ON tc.constraint_name = kcu.constraint_name
				AND tc.table_schema = kcu.table_schema
			JOIN information_schema.constraint_column_usage ccu
				ON ccu.constraint_name = tc.constraint_name
				AND ccu.table_schema = tc.table_schema
			WHERE tc.constraint_type = 'FOREIGN KEY'
				AND ccu.table_name = 'user'
				AND ccu.column_name = 'id'
		`);

		console.log("Foreign keys referencing user.id:", fkResult.rows);

		// Start a transaction
		await db.query("BEGIN");

		// Drop all foreign key constraints referencing user.id
		for (const fk of fkResult.rows) {
			console.log(
				`Dropping constraint: ${fk.constraint_name} on ${fk.referencing_table}`,
			);
			await db.query(`
				ALTER TABLE "${fk.referencing_table}" 
				DROP CONSTRAINT "${fk.constraint_name}"
			`);
		}

		// Update the user.id column to UUID
		console.log("Updating user.id to UUID...");
		await db.query(`
			ALTER TABLE "user" 
			ALTER COLUMN id TYPE uuid USING id::uuid
		`);

		// Update the referencing columns to UUID as well
		for (const fk of fkResult.rows) {
			console.log(`Updating ${fk.referencing_table}.${fk.referencing_column} to UUID...`);
			await db.query(`
				ALTER TABLE "${fk.referencing_table}" 
				ALTER COLUMN "${fk.referencing_column}" TYPE uuid USING "${fk.referencing_column}"::uuid
			`);
		}

		// Re-create the foreign key constraints
		for (const fk of fkResult.rows) {
			console.log(`Re-creating constraint: ${fk.constraint_name}`);
			await db.query(`
				ALTER TABLE "${fk.referencing_table}"
				ADD CONSTRAINT "${fk.constraint_name}"
				FOREIGN KEY ("${fk.referencing_column}")
				REFERENCES "user" (id)
			`);
		}

		// Commit the transaction
		await db.query("COMMIT");

		console.log("✅ Successfully updated user.id column to UUID type");

		// Verify the change
		const verifyResult = await db.query(`
			SELECT column_name, data_type 
			FROM information_schema.columns 
			WHERE table_name = 'user' AND column_name = 'id'
		`);
		console.log("Updated column info:", verifyResult.rows[0]);
	} catch (error) {
		await db.query("ROLLBACK");
		console.error("❌ Error updating column:", error);
		throw error;
	} finally {
		await db.end();
		console.log("Database connection closed");
	}
}

updateUserIdToUuid();
