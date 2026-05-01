import { db } from "@test-evals/db";
import { extractionRun } from "@test-evals/db/schema";
import { desc, eq } from "drizzle-orm";

type RunUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheWriteInputTokens: number;
};

export async function recordExtractionRun(params: {
  strategy: string;
  model: string;
  status: "success" | "failed";
  attempts: number;
  usage: RunUsage;
  durationMs: number;
  transcript?: string;
  output?: any;
}) {
  const [row] = await db
    .insert(extractionRun)
    .values({
      strategy: params.strategy,
      model: params.model,
      status: params.status,
      attempts: params.attempts,
      inputTokens: params.usage.inputTokens,
      outputTokens: params.usage.outputTokens,
      cacheReadInputTokens: params.usage.cacheReadInputTokens,
      cacheWriteInputTokens: params.usage.cacheWriteInputTokens,
      durationMs: params.durationMs,
      transcript: params.transcript,
      output: params.output,
    })
    .returning({ id: extractionRun.id });

  return row?.id ?? null;
}

export async function listExtractionRuns(limit = 25) {
  return db
    .select({
      id: extractionRun.id,
      strategy: extractionRun.strategy,
      model: extractionRun.model,
      status: extractionRun.status,
      attempts: extractionRun.attempts,
      inputTokens: extractionRun.inputTokens,
      outputTokens: extractionRun.outputTokens,
      cacheReadInputTokens: extractionRun.cacheReadInputTokens,
      cacheWriteInputTokens: extractionRun.cacheWriteInputTokens,
      durationMs: extractionRun.durationMs,
      createdAt: extractionRun.createdAt,
    })
    .from(extractionRun)
    .orderBy(desc(extractionRun.createdAt))
    .limit(limit);
}

export async function getExtractionRun(id: number) {
  const [row] = await db
    .select()
    .from(extractionRun)
    .where(eq(extractionRun.id, id));
  return row ?? null;
}
