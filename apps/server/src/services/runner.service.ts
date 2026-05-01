import { readdir } from "node:fs/promises";
import path from "node:path";

import { db } from "@test-evals/db";
import { evaluationCase, evaluationRun, extractionCache } from "@test-evals/db/schema";
import { and, desc, eq } from "drizzle-orm";

import { extractTranscript } from "./extract.service";
import { evaluateCase } from "./evaluate.service";
import { getPromptHash, type PromptStrategy } from "@test-evals/llm";

type DatasetFilter = {
  case_ids?: string[];
  limit?: number;
};

type RunParams = {
  strategy: string;
  model: string;
  datasetFilter?: DatasetFilter;
  pricing?: {
    inputPer1k: number;
    outputPer1k: number;
    cacheReadPer1k: number;
    cacheWritePer1k: number;
  };
  force?: boolean;
};

type CaseData = {
  caseId: string;
  transcript: string;
  gold: unknown;
};

type RunEvent =
  | { type: "case-complete"; caseId: string; runId: number; completed: number; total: number }
  | { type: "case-error"; caseId: string; runId: number; completed: number; total: number }
  | { type: "case-skipped"; caseId: string; runId: number; completed: number; total: number }
  | { type: "run-complete"; runId: number }
  | { type: "run-error"; runId: number; message: string }
  | { type: "connected"; runId: number };

const MAX_CONCURRENCY = 5;
const MAX_RATE_RETRIES = 5;

function createQueue(limit: number) {
  const running = new Set<Promise<void>>();

  async function push(task: () => Promise<void>) {
    while (running.size >= limit) {
      await Promise.race(running);
    }
    const runner = task().finally(() => running.delete(runner));
    running.add(runner);
    return runner;
  }

  async function flush() {
    await Promise.all(running);
  }

  return { push, flush };
}

// Global semaphore to limit concurrency across all runs
const globalQueue = createQueue(MAX_CONCURRENCY);

const subscribers = new Map<number, Set<(event: RunEvent) => void>>();

export function subscribeRun(runId: number, handler: (event: RunEvent) => void) {
  const set = subscribers.get(runId) ?? new Set();
  set.add(handler);
  subscribers.set(runId, set);

  return () => {
    const existing = subscribers.get(runId);
    if (!existing) return;
    existing.delete(handler);
    if (existing.size === 0) subscribers.delete(runId);
  };
}

function publish(runId: number, event: RunEvent) {
  const set = subscribers.get(runId);
  if (!set) return;
  for (const handler of set) {
    handler(event);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const message = "message" in error ? String((error as any).message) : "";
  const status = "status" in error ? Number((error as any).status) : 0;
  return status === 429 || message.includes("429") || message.toLowerCase().includes("rate limit");
}

async function withRateLimitBackoff<T>(fn: () => Promise<T>) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      if (!isRateLimitError(error) || attempt > MAX_RATE_RETRIES) {
        throw error;
      }
      const delay = Math.pow(2, attempt - 1) * 1000;
      await sleep(delay);
    }
  }
}

function resolveDataPath(...segments: string[]) {
  // Use file-relative path to be robust across different CWDs
  // src/services/runner.service.ts -> ../../../../data
  return path.resolve(import.meta.dir, "../../../../data", ...segments);
}

async function loadCases(filter?: DatasetFilter): Promise<CaseData[]> {
  const transcriptsDir = resolveDataPath("transcripts");
  const goldDir = resolveDataPath("gold");

  try {
    const files = await readdir(transcriptsDir);
    const caseIds = files
      .filter((file) => file.endsWith(".txt"))
      .map((file) => file.replace(/\.txt$/, ""))
      .sort();

    const filtered = filter?.case_ids?.length
      ? caseIds.filter((id) => filter.case_ids?.includes(id))
      : caseIds;

    const limited = typeof filter?.limit === "number" ? filtered.slice(0, filter.limit) : filtered;

    const cases: CaseData[] = [];
    for (const caseId of limited) {
      const transcript = await Bun.file(path.join(transcriptsDir, `${caseId}.txt`)).text();
      const gold = await Bun.file(path.join(goldDir, `${caseId}.json`)).json();
      cases.push({ caseId, transcript, gold });
    }

    return cases;
  } catch (error) {
    console.error("Failed to load cases:", error);
    return [];
  }
}

async function getCachedExtraction(params: { caseId: string; strategy: string; model: string }) {
  const rows = await db
    .select()
    .from(extractionCache)
    .where(
      and(
        eq(extractionCache.caseId, params.caseId),
        eq(extractionCache.strategy, params.strategy),
        eq(extractionCache.model, params.model),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

async function upsertCache(params: {
  caseId: string;
  strategy: string;
  model: string;
  prediction: unknown;
  attempts: unknown;
  usage: unknown;
}) {
  await db
    .insert(extractionCache)
    .values({
      caseId: params.caseId,
      strategy: params.strategy,
      model: params.model,
      prediction: params.prediction,
      attempts: params.attempts,
      usage: params.usage as any,
    })
    .onConflictDoUpdate({
      target: [extractionCache.caseId, extractionCache.strategy, extractionCache.model],
      set: {
        prediction: params.prediction,
        attempts: params.attempts,
        usage: params.usage as any,
      },
    });
}

async function getCompletedCase(runId: number, caseId: string) {
  const rows = await db
    .select()
    .from(evaluationCase)
    .where(and(eq(evaluationCase.runId, runId), eq(evaluationCase.caseId, caseId)))
    .limit(1);

  return rows[0] ?? null;
}

async function recordCaseResult(params: {
  runId: number;
  caseId: string;
  evaluation: any;
  prediction: unknown;
  transcript: string;
  gold: unknown;
  attempts: unknown;
  usage: unknown;
  wallTimeMs: number;
}) {
  await db.insert(evaluationCase).values({
    runId: params.runId,
    caseId: params.caseId,
    schemaValid: params.evaluation.schemaValid,
    schemaErrors: params.evaluation.schemaErrors,
    hallucinationCount: params.evaluation.hallucinationCount,
    hallucinatedValues: params.evaluation.hallucinatedValues,
    scores: params.evaluation.scores,
    overall: params.evaluation.overall,
    usage: params.usage as any,
    wallTimeMs: params.wallTimeMs,
    prediction: params.prediction,
    attempts: params.attempts,
  });
}

async function listRunCases(runId: number) {
  return db
    .select()
    .from(evaluationCase)
    .where(eq(evaluationCase.runId, runId));
}

function aggregateRun(cases: any[], pricing?: RunParams["pricing"], wallTimeMs?: number) {
  const count = cases.length || 1;
  const totals = cases.reduce(
    (acc, item) => {
      const scores = item.scores || {};
      acc.chiefComplaint += scores.chiefComplaint || 0;
      acc.vitals += scores.vitals || 0;
      acc.medicationsF1 += scores.medications?.f1 || 0;
      acc.diagnosesF1 += scores.diagnoses?.score || 0;
      acc.planF1 += scores.plan?.f1 || 0;
      acc.followUp += scores.followUp?.score || 0;
      acc.overall += item.overall || 0;
      acc.hallucinationCount += item.hallucinationCount || 0;
      acc.schemaFailureCount += item.schemaValid ? 0 : 1;
      
      const usage = item.usage || {};
      acc.usage.inputTokens += usage.inputTokens || 0;
      acc.usage.outputTokens += usage.outputTokens || 0;
      acc.usage.cacheReadInputTokens += usage.cacheReadInputTokens || 0;
      acc.usage.cacheWriteInputTokens += usage.cacheWriteInputTokens || 0;
      return acc;
    },
    {
      chiefComplaint: 0,
      vitals: 0,
      medicationsF1: 0,
      diagnosesF1: 0,
      planF1: 0,
      followUp: 0,
      overall: 0,
      hallucinationCount: 0,
      schemaFailureCount: 0,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheWriteInputTokens: 0,
      },
    },
  );

  const aggregates = {
    chiefComplaint: totals.chiefComplaint / count,
    vitals: totals.vitals / count,
    medicationsF1: totals.medicationsF1 / count,
    diagnosesF1: totals.diagnosesF1 / count,
    planF1: totals.planF1 / count,
    followUp: totals.followUp / count,
    overall: totals.overall / count,
  };

  const pricingConfig = {
    inputPer1k: pricing?.inputPer1k ?? 0,
    outputPer1k: pricing?.outputPer1k ?? 0,
    cacheReadPer1k: pricing?.cacheReadPer1k ?? 0,
    cacheWritePer1k: pricing?.cacheWritePer1k ?? 0,
  };

  const totalCostUsd =
    (totals.usage.inputTokens / 1000) * pricingConfig.inputPer1k +
    (totals.usage.outputTokens / 1000) * pricingConfig.outputPer1k +
    (totals.usage.cacheReadInputTokens / 1000) * pricingConfig.cacheReadPer1k +
    (totals.usage.cacheWriteInputTokens / 1000) * pricingConfig.cacheWritePer1k;

  return {
    aggregates,
    usage: totals.usage,
    hallucinationCount: totals.hallucinationCount,
    schemaFailureCount: totals.schemaFailureCount,
    wallTimeMs: wallTimeMs ?? cases.reduce((sum, item) => sum + item.wallTimeMs, 0),
    totalCostUsd,
  };
}

async function updateRun(runId: number, values: Partial<typeof evaluationRun.$inferInsert>) {
  await db.update(evaluationRun).set(values).where(eq(evaluationRun.id, runId));
}

async function runCases(runId: number, params: RunParams, cases: CaseData[]) {
  const startedAt = Date.now();
  let completed = 0;
  const total = cases.length;

  await updateRun(runId, { status: "running" });

  const tasks = cases.map((item) => async () => {
    const alreadyDone = await getCompletedCase(runId, item.caseId);
    if (alreadyDone) {
      completed += 1;
      publish(runId, { type: "case-skipped", caseId: item.caseId, runId, completed, total });
      return;
    }

    const caseStartedAt = Date.now();

    try {
      let prediction: unknown = null;
      let attempts: any[] = [];
      let usage: any = {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheWriteInputTokens: 0,
      };

      // Idempotency: Check cache first
      const cached = params.force
        ? null
        : await getCachedExtraction({
            caseId: item.caseId,
            strategy: params.strategy,
            model: params.model,
          });

      if (cached) {
        prediction = cached.prediction;
        attempts = (cached.attempts as any[]) || [];
        usage = cached.usage;
      } else {
        const extraction = await withRateLimitBackoff(() =>
          extractTranscript({
            transcript: item.transcript,
            strategy: params.strategy as any,
            model: params.model,
          }),
        );
        prediction = extraction.output;
        attempts = extraction.attempts;
        usage = extraction.usage;

        await upsertCache({
          caseId: item.caseId,
          strategy: params.strategy,
          model: params.model,
          prediction,
          attempts,
          usage,
        });
      }

      const evaluation = evaluateCase({
        id: item.caseId,
        transcript: item.transcript,
        prediction,
        gold: item.gold as any,
        usage,
        wallTimeMs: Date.now() - caseStartedAt,
      });

      await recordCaseResult({
        runId,
        caseId: item.caseId,
        evaluation,
        prediction,
        transcript: item.transcript,
        gold: item.gold,
        attempts,
        usage,
        wallTimeMs: Date.now() - caseStartedAt,
      });

      completed += 1;
      publish(runId, {
        type: "case-complete",
        caseId: item.caseId,
        runId,
        completed,
        total,
      });
    } catch (error) {
      console.error(`Case ${item.caseId} failed:`, error);
      completed += 1;
      publish(runId, {
        type: "case-error",
        caseId: item.caseId,
        runId,
        completed,
        total,
      });
    }
  });

  // Run tasks through global semaphore
  await Promise.all(tasks.map((task) => globalQueue.push(task)));

  const wallTimeMs = Date.now() - startedAt;
  const storedCases = await listRunCases(runId);
  const evaluation = aggregateRun(storedCases as any[], params.pricing, wallTimeMs);

  await updateRun(runId, {
    status: "completed",
    schemaFailureCount: evaluation.schemaFailureCount,
    hallucinationCount: evaluation.hallucinationCount,
    aggregates: evaluation.aggregates,
    usage: evaluation.usage as any,
    wallTimeMs: evaluation.wallTimeMs,
    totalCostUsd: evaluation.totalCostUsd,
  });

  publish(runId, { type: "run-complete", runId });
}

export async function startRun(params: RunParams) {
  const cases = await loadCases(params.datasetFilter);
  if (cases.length === 0) {
    throw new Error("No cases found matching filter");
  }

  const [row] = await db
    .insert(evaluationRun)
    .values({
      strategy: params.strategy,
      model: params.model,
      status: "pending",
      datasetFilter: params.datasetFilter ?? null,
      caseCount: cases.length,
      schemaFailureCount: 0,
      hallucinationCount: 0,
      aggregates: {},
      usage: {},
      wallTimeMs: 0,
      totalCostUsd: 0,
      promptHash: getPromptHash(params.strategy as PromptStrategy),
    })
    .returning({ id: evaluationRun.id });

  const runId = row?.id;
  if (!runId) throw new Error("Failed to create run");

  void runCases(runId, params, cases).catch((err) => {
    console.error(`Run ${runId} execution error:`, err);
    void updateRun(runId, { status: "failed" });
    publish(runId, { type: "run-error", runId, message: String(err) });
  });

  return runId;
}

export async function resumeRun(runId: number) {
  const rows = await db
    .select()
    .from(evaluationRun)
    .where(eq(evaluationRun.id, runId))
    .limit(1);

  const run = rows[0];
  if (!run) throw new Error("Run not found");

  const cases = await loadCases(run.datasetFilter as DatasetFilter | undefined);
  const params: RunParams = {
    strategy: run.strategy ?? "zero_shot",
    model: run.model ?? "claude-haiku-4-5-20251001",
  };

  void runCases(runId, params, cases).catch((err) => {
    console.error(`Resume run ${runId} execution error:`, err);
    void updateRun(runId, { status: "failed" });
    publish(runId, { type: "run-error", runId, message: String(err) });
  });

  return runId;
}

export async function listRuns(limit = 25) {
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
      createdAt: evaluationRun.createdAt,
    })
    .from(evaluationRun)
    .orderBy(desc(evaluationRun.createdAt))
    .limit(limit);
}
