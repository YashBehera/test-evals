import { db } from "@test-evals/db";
import { evaluationCase, evaluationRun } from "@test-evals/db/schema";
import { desc, eq } from "drizzle-orm";

export type EvaluationRunSummary = {
  id: number;
  strategy: string | null;
  model: string | null;
  status: string;
  caseCount: number;
  schemaFailureCount: number;
  hallucinationCount: number;
  aggregates: unknown;
  usage: unknown;
  wallTimeMs: number;
  totalCostUsd: number;
  createdAt: Date;
};

export async function recordEvaluationRun(params: {
  strategy?: string;
  model?: string;
  status: string;
  caseCount: number;
  schemaFailureCount: number;
  hallucinationCount: number;
  aggregates: unknown;
  usage: unknown;
  wallTimeMs: number;
  totalCostUsd: number;
}) {
  const [row] = await db
    .insert(evaluationRun)
    .values({
      strategy: params.strategy ?? null,
      model: params.model ?? null,
      status: params.status,
      caseCount: params.caseCount,
      schemaFailureCount: params.schemaFailureCount,
      hallucinationCount: params.hallucinationCount,
      aggregates: params.aggregates,
      usage: params.usage,
      wallTimeMs: params.wallTimeMs,
      totalCostUsd: params.totalCostUsd,
    })
    .returning({ id: evaluationRun.id });

  return row?.id ?? null;
}

export async function recordEvaluationCases(
  runId: number,
  cases: Array<{
    caseId: string;
    schemaValid: boolean;
    schemaErrors: string[];
    hallucinationCount: number;
    hallucinatedValues: string[];
    scores: unknown;
    overall: number;
    usage: unknown;
    wallTimeMs: number;
    prediction?: unknown;
    attempts?: unknown;
  }>,
) {
  if (cases.length === 0) {
    return;
  }

  await db.insert(evaluationCase).values(
    cases.map((item) => ({
      runId,
      caseId: item.caseId,
      schemaValid: item.schemaValid,
      schemaErrors: item.schemaErrors,
      hallucinationCount: item.hallucinationCount,
      hallucinatedValues: item.hallucinatedValues,
      scores: item.scores,
      overall: item.overall,
      usage: item.usage,
      wallTimeMs: item.wallTimeMs,
      prediction: item.prediction,
      attempts: item.attempts,
    })),
  );
}

export async function listEvaluationRuns(limit = 25) {
  return db
    .select({
      id: evaluationRun.id,
      strategy: evaluationRun.strategy,
      model: evaluationRun.model,
      status: evaluationRun.status,
      caseCount: evaluationRun.caseCount,
      schemaFailureCount: evaluationRun.schemaFailureCount,
      hallucinationCount: evaluationRun.hallucinationCount,
      aggregates: evaluationRun.aggregates,
      usage: evaluationRun.usage,
      wallTimeMs: evaluationRun.wallTimeMs,
      totalCostUsd: evaluationRun.totalCostUsd,
      promptHash: evaluationRun.promptHash,
      createdAt: evaluationRun.createdAt,
    })
    .from(evaluationRun)
    .orderBy(desc(evaluationRun.createdAt))
    .limit(limit);
}

export async function getEvaluationRun(runId: number) {
  const [run] = await db
    .select({
      id: evaluationRun.id,
      strategy: evaluationRun.strategy,
      model: evaluationRun.model,
      status: evaluationRun.status,
      caseCount: evaluationRun.caseCount,
      schemaFailureCount: evaluationRun.schemaFailureCount,
      hallucinationCount: evaluationRun.hallucinationCount,
      aggregates: evaluationRun.aggregates,
      usage: evaluationRun.usage,
      wallTimeMs: evaluationRun.wallTimeMs,
      totalCostUsd: evaluationRun.totalCostUsd,
      promptHash: evaluationRun.promptHash,
      createdAt: evaluationRun.createdAt,
    })
    .from(evaluationRun)
    .where(eq(evaluationRun.id, runId));

  if (!run) {
    return null;
  }

  const cases = await db
    .select({
      id: evaluationCase.id,
      caseId: evaluationCase.caseId,
      schemaValid: evaluationCase.schemaValid,
      schemaErrors: evaluationCase.schemaErrors,
      hallucinationCount: evaluationCase.hallucinationCount,
      hallucinatedValues: evaluationCase.hallucinatedValues,
      scores: evaluationCase.scores,
      overall: evaluationCase.overall,
      usage: evaluationCase.usage,
      wallTimeMs: evaluationCase.wallTimeMs,
      prediction: evaluationCase.prediction,
      attempts: evaluationCase.attempts,
    })
    .from(evaluationCase)
    .where(eq(evaluationCase.runId, runId));

  return { run, cases };
}
