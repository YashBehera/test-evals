import { auth } from "@test-evals/auth";
import { env } from "@test-evals/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { streamSSE } from "hono/streaming";

import path from "node:path";

import { extractTranscript } from "./services/extract.service";
import { evaluateRun } from "./services/evaluate.service";
import {
  getExtractionRun,
  listExtractionRuns,
  recordExtractionRun,
} from "./services/extraction-run.service";
import {
  getEvaluationRun,
  listEvaluationRuns,
  recordEvaluationCases,
  recordEvaluationRun,
} from "./services/evaluation-run.service";
import {
  listRuns,
  resumeRun,
  startRun,
  subscribeRun,
} from "./services/runner.service";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.post("/api/v1/extract", async (c) => {
  const body = await c.req.json();
  const transcript = typeof body?.transcript === "string" ? body.transcript : "";
  const strategy = body?.strategy ?? "zero_shot";
  const model = body?.model ?? "claude-haiku-4-5-20251001";

  if (!transcript) {
    return c.json({ error: "transcript is required" }, 400);
  }

  const startedAt = Date.now();
  const result = await extractTranscript({ transcript, strategy, model });
  const durationMs = Date.now() - startedAt;

  const runId = await recordExtractionRun({
    strategy,
    model,
    status: result.success ? "success" : "failed",
    attempts: result.attempts.length,
    usage: result.usage,
    durationMs,
    transcript,
    output: result.output,
  });

  return c.json({
    runId,
    success: result.success,
    schemaErrors: result.schemaErrors,
    output: result.output,
    attempts: result.attempts,
    usage: result.usage,
    durationMs,
  });
});

app.get("/api/v1/extract/runs", async (c) => {
  const limit = Number(c.req.query("limit") ?? "25");
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 25;
  const runs = await listExtractionRuns(safeLimit);

  return c.json({ runs });
});

app.get("/api/v1/extract/runs/:id", async (c) => {
  const runId = Number(c.req.param("id"));
  if (!Number.isFinite(runId)) {
    return c.json({ error: "Invalid run id" }, 400);
  }
  const run = await getExtractionRun(runId);
  if (!run) {
    return c.json({ error: "Run not found" }, 404);
  }
  return c.json({ run });
});

app.post("/api/v1/runs", async (c) => {
  const body = await c.req.json();
  const strategy = body?.strategy ?? "zero_shot";
  const model = body?.model ?? "claude-haiku-4-5-20251001";
  const runId = await startRun({
    strategy,
    model,
    datasetFilter: body?.dataset_filter,
    pricing: body?.pricing,
    force: Boolean(body?.force),
  });

  return c.json({ runId });
});

app.post("/api/v1/runs/:id/resume", async (c) => {
  const runId = Number(c.req.param("id"));
  if (!Number.isFinite(runId)) {
    return c.json({ error: "Invalid run id" }, 400);
  }

  await resumeRun(runId);
  return c.json({ runId });
});

app.get("/api/v1/runs", async (c) => {
  const limit = Number(c.req.query("limit") ?? "25");
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 25;
  const runs = await listRuns(safeLimit);
  return c.json({ runs });
});

app.get("/api/v1/runs/:id/stream", async (c) => {
  const runId = Number(c.req.param("id"));
  if (!Number.isFinite(runId)) {
    return c.json({ error: "Invalid run id" }, 400);
  }

  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");

  return streamSSE(c, async (stream) => {
    const send = async (event: unknown) => {
      await stream.writeSSE({
        data: JSON.stringify(event),
      });
    };

    const unsubscribe = subscribeRun(runId, send);
    await send({ type: "connected", runId });

    stream.onAbort(() => {
      unsubscribe();
    });
  });
});

app.post("/api/v1/evaluate", async (c) => {
  const body = await c.req.json();
  const cases = Array.isArray(body?.cases) ? body.cases : [];

  if (cases.length === 0) {
    return c.json({ error: "cases is required" }, 400);
  }

  const result = evaluateRun({
    cases,
    pricing: body?.pricing,
    wallTimeMs: body?.wallTimeMs,
  });

  const runId = await recordEvaluationRun({
    strategy: body?.strategy,
    model: body?.model,
    status: "completed",
    caseCount: result.cases.length,
    schemaFailureCount: result.schemaFailureCount,
    hallucinationCount: result.hallucinationCount,
    aggregates: result.aggregates,
    usage: result.usage,
    wallTimeMs: result.wallTimeMs,
    totalCostUsd: result.totalCostUsd,
  });

  if (runId) {
    await recordEvaluationCases(
      runId,
      result.cases.map((item) => ({
        caseId: item.id,
        schemaValid: item.schemaValid,
        schemaErrors: item.schemaErrors,
        hallucinationCount: item.hallucinationCount,
        hallucinatedValues: item.hallucinatedValues,
        scores: item.scores,
        overall: item.overall,
        usage: item.usage,
        wallTimeMs: item.wallTimeMs,
      })),
    );
  }

  return c.json({
    runId,
    aggregates: result.aggregates,
    usage: result.usage,
    hallucinationCount: result.hallucinationCount,
    schemaFailureCount: result.schemaFailureCount,
    totalCostUsd: result.totalCostUsd,
    wallTimeMs: result.wallTimeMs,
    cases: result.cases,
  });
});

app.get("/api/v1/cases/:id/transcript", async (c) => {
  const id = c.req.param("id");
  try {
    const transcriptPath = path.resolve(import.meta.dir, "../../../data/transcripts", `${id}.txt`);
    console.log(`Reading transcript from: ${transcriptPath}`);
    const transcript = await Bun.file(transcriptPath).text();
    return c.json({ transcript });
  } catch (err) {
    console.error(`Transcript load error for ${id}:`, err);
    return c.json({ error: "Transcript not found" }, 404);
  }
});

app.get("/api/v1/cases/:id/gold", async (c) => {
  const id = c.req.param("id");
  try {
    const goldPath = path.resolve(import.meta.dir, "../../../data/gold", `${id}.json`);
    console.log(`Reading gold from: ${goldPath}`);
    const gold = await Bun.file(goldPath).json();
    return c.json({ gold });
  } catch (err) {
    console.error(`Gold load error for ${id}:`, err);
    return c.json({ error: "Gold standard not found" }, 404);
  }
});

app.get("/api/v1/evaluate/runs", async (c) => {
  const limit = Number(c.req.query("limit") ?? "25");
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 25;
  const runs = await listEvaluationRuns(safeLimit);
  return c.json({ runs });
});

app.get("/api/v1/evaluate/runs/:id", async (c) => {
  const runId = Number(c.req.param("id"));
  if (!Number.isFinite(runId)) {
    return c.json({ error: "Invalid run id" }, 400);
  }

  const result = await getEvaluationRun(runId);
  if (!result) {
    return c.json({ error: "Run not found" }, 404);
  }

  return c.json(result);
});

app.get("/", (c) => {
  return c.text("OK");
});

export default app;
