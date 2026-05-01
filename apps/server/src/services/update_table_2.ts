import { sql } from "drizzle-orm";
import { db } from "@test-evals/db";

async function updateTable() {
  console.log("Updating evaluation_case table...");
  try {
    await db.execute(sql`
      ALTER TABLE "evaluation_case" ADD COLUMN IF NOT EXISTS "prediction" jsonb;
      ALTER TABLE "evaluation_case" ADD COLUMN IF NOT EXISTS "attempts" jsonb;
    `);
    console.log("Columns added successfully.");
  } catch (err) {
    console.error("Failed to update table:", err);
  }
  process.exit(0);
}

updateTable();
