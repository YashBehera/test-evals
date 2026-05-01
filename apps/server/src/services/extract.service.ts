import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import extractionSchema from "../../../../data/schema.json";

import { extractWithStrategy, type ExtractionAttempt } from "@test-evals/llm";
import { env } from "@test-evals/env/server";

export type ExtractStrategy = "zero_shot" | "few_shot" | "cot";

export type ExtractResult = {
  output: unknown;
  attempts: Array<ExtractionAttempt & { attempt: number; validationErrors: string[] }>;
  success: boolean;
  schemaErrors: string[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheWriteInputTokens: number;
  };
};

const MAX_ATTEMPTS = 3;

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateExtraction = ajv.compile(extractionSchema);

function shouldUseMock() {
  return env.MOCK_LLM === "true" || !env.ANTHROPIC_API_KEY;
}

function extractVitals(transcript: string) {
  const bpMatch = transcript.match(/\b(\d{2,3}\/\d{2,3})\b/);
  const hrMatch = transcript.match(/\bHR\s*[:=]?\s*(\d{2,3})\b/i);
  const tempMatch = transcript.match(/\b(?:Temp|Temperature)\s*[:=]?\s*(\d{2,3}(?:\.\d)?)\b/i);
  const spo2Match = transcript.match(/\bSpO2\s*[:=]?\s*(\d{2,3})\b/i);

  return {
    bp: bpMatch?.[1] ?? null,
    hr: hrMatch ? Number(hrMatch[1]) : null,
    temp_f: tempMatch ? Number(tempMatch[1]) : null,
    spo2: spo2Match ? Number(spo2Match[1]) : null,
  };
}

function buildMockExtraction(transcript: string) {
  const cleaned = transcript.trim().replace(/\s+/g, " ");
  const chiefComplaint = cleaned.length > 0 ? cleaned.slice(0, 120) : "unspecified";

  return {
    chief_complaint: chiefComplaint,
    vitals: extractVitals(cleaned),
    medications: [],
    diagnoses: [],
    plan: [],
    follow_up: {
      interval_days: null,
      reason: null,
    },
  };
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors || errors.length === 0) {
    return ["Unknown schema validation error."];
  }

  return errors.map((error) => {
    const path = error.instancePath ? `at ${error.instancePath}` : "";
    const message = error.message ?? "Schema validation error";
    return [message, path].filter(Boolean).join(" ");
  });
}

function summarizeUsage(attempts: ExtractionAttempt[]) {
  return attempts.reduce(
    (totals, attempt) => {
      totals.inputTokens += attempt.usage.input_tokens ?? 0;
      totals.outputTokens += attempt.usage.output_tokens ?? 0;
      totals.cacheReadInputTokens += attempt.usage.cache_read_input_tokens ?? 0;
      totals.cacheWriteInputTokens += attempt.usage.cache_write_input_tokens ?? 0;
      return totals;
    },
    {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheWriteInputTokens: 0,
    },
  );
}

export async function extractTranscript(params: {
  transcript: string;
  strategy: ExtractStrategy;
  model: string;
}): Promise<ExtractResult> {
  if (shouldUseMock()) {
    const mockOutput = buildMockExtraction(params.transcript);
    const isValid = validateExtraction(mockOutput);

    const attempt: ExtractionAttempt & { attempt: number; validationErrors: string[] } = {
      responseId: "mock",
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_write_input_tokens: 0,
      },
      toolInput: mockOutput,
      rawContent: [{ type: "tool_use", name: "mock", input: mockOutput }],
      attempt: 1,
      validationErrors: isValid ? [] : formatAjvErrors(validateExtraction.errors),
    };

    console.info("Extract attempt 1: mock");

    return {
      output: mockOutput,
      attempts: [attempt],
      success: isValid,
      schemaErrors: isValid ? [] : formatAjvErrors(validateExtraction.errors),
      usage: summarizeUsage([attempt]),
    };
  }

  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is required when MOCK_LLM is false");
  }

  const attempts: Array<ExtractionAttempt & { attempt: number; validationErrors: string[] }> = [];
  let lastErrors: string[] = [];
  let lastOutput: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = await extractWithStrategy({
      apiKey: env.ANTHROPIC_API_KEY,
      model: params.model,
      strategy: params.strategy,
      transcript: params.transcript,
      schema: extractionSchema,
      validationErrors: lastErrors,
      previousOutput: lastOutput ?? undefined,
    });

    const toolInput = result.toolInput;
    const isValid = toolInput !== null && validateExtraction(toolInput);
    const validationErrors = isValid
      ? []
      : toolInput === null
        ? ["Model did not return a tool output."]
        : formatAjvErrors(validateExtraction.errors);

    attempts.push({
      ...result,
      attempt,
      validationErrors,
    });

    console.info(
      `Extract attempt ${attempt}: ${validationErrors.length === 0 ? "valid" : "invalid"}`,
    );

    if (isValid) {
      return {
        output: toolInput,
        attempts,
        success: true,
        schemaErrors: [],
        usage: summarizeUsage(attempts),
      };
    }

    lastErrors = validationErrors;
    lastOutput = toolInput;
  }

  return {
    output: lastOutput,
    attempts,
    success: false,
    schemaErrors: lastErrors,
    usage: summarizeUsage(attempts),
  };
}
