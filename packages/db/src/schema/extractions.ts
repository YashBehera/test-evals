import { integer, pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const extractionRun = pgTable("extraction_run", {
  id: serial("id").primaryKey(),
  strategy: text("strategy").notNull(),
  model: text("model").notNull(),
  status: text("status").notNull(),
  attempts: integer("attempts").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  cacheReadInputTokens: integer("cache_read_input_tokens").notNull(),
  cacheWriteInputTokens: integer("cache_write_input_tokens").notNull(),
  durationMs: integer("duration_ms"),
  transcript: text("transcript"),
  output: jsonb("output"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
