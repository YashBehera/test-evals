import { env } from "@test-evals/env/web";

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export type ExtractionRun = {
  id: number;
  strategy: string;
  model: string;
  status: string;
  attempts: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheWriteInputTokens: number;
  durationMs: number;
  transcript?: string;
  output?: any;
  createdAt: string;
};

export type EvaluationRun = {
  id: number;
  strategy: string;
  model: string;
  status: string;
  caseCount: number;
  schemaFailureCount: number;
  hallucinationCount: number;
  aggregates: {
    chiefComplaint: number;
    vitals: number;
    medicationsF1: number;
    diagnosesF1: number;
    planF1: number;
    followUp: number;
    overall: number;
  };
  usage: any;
  wallTimeMs: number;
  totalCostUsd: number;
  promptHash?: string;
  createdAt: string;
};

export type EvaluationCase = {
  id: number;
  runId: number;
  caseId: string;
  schemaValid: boolean;
  schemaErrors: any;
  hallucinationCount: number;
  hallucinatedValues: any;
  scores: {
    chiefComplaint: number;
    vitals: number;
    medications?: { f1: number; matches: any[]; missing: any[]; extra: any[] };
    diagnoses?: { score: number; matches: any[]; missing: any[]; extra: any[] };
    plan?: { f1: number; matches: any[]; missing: any[]; extra: any[] };
    followUp?: { score: number };
  };
  overall: number;
  usage: any;
  wallTimeMs: number;
  prediction?: any;
  attempts?: any[];
};
