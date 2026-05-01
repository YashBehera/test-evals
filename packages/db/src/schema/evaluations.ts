import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const evaluationRun = pgTable("evaluation_run", {
  id: serial("id").primaryKey(),
  strategy: text("strategy"),
  model: text("model"),
  status: text("status").notNull(),
  datasetFilter: jsonb("dataset_filter"),
  caseCount: integer("case_count").notNull(),
  schemaFailureCount: integer("schema_failure_count").notNull(),
  hallucinationCount: integer("hallucination_count").notNull(),
  aggregates: jsonb("aggregates").notNull(),
  usage: jsonb("usage").notNull(),
  wallTimeMs: integer("wall_time_ms").notNull(),
  totalCostUsd: doublePrecision("total_cost_usd").notNull(),
  promptHash: text("prompt_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const evaluationCase = pgTable("evaluation_case", {
  id: serial("id").primaryKey(),
  runId: integer("run_id")
    .notNull()
    .references(() => evaluationRun.id, { onDelete: "cascade" }),
  caseId: text("case_id").notNull(),
  schemaValid: boolean("schema_valid").notNull(),
  schemaErrors: jsonb("schema_errors").notNull(),
  hallucinationCount: integer("hallucination_count").notNull(),
  hallucinatedValues: jsonb("hallucinated_values").notNull(),
  scores: jsonb("scores").notNull(),
  overall: doublePrecision("overall").notNull(),
  usage: jsonb("usage").notNull(),
  wallTimeMs: integer("wall_time_ms").notNull(),
  prediction: jsonb("prediction"),
  attempts: jsonb("attempts"),
});
