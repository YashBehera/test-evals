import { jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const extractionCache = pgTable(
  "extraction_cache",
  {
    id: serial("id").primaryKey(),
    caseId: text("case_id").notNull(),
    strategy: text("strategy").notNull(),
    model: text("model").notNull(),
    prediction: jsonb("prediction").notNull(),
    attempts: jsonb("attempts").notNull(),
    usage: jsonb("usage").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("extraction_cache_case_strategy_model").on(
      table.caseId,
      table.strategy,
      table.model,
    ),
  ],
);
