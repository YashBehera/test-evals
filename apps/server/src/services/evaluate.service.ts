import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import extractionSchema from "../../../../data/schema.json";

type Vitals = {
  bp: string | null;
  hr: number | null;
  temp_f: number | null;
  spo2: number | null;
};

type Medication = {
  name: string;
  dose: string | null;
  frequency: string | null;
  route: string | null;
};

type Diagnosis = {
  description: string;
  icd10?: string;
};

type FollowUp = {
  interval_days: number | null;
  reason: string | null;
};

type Extraction = {
  chief_complaint: string;
  vitals: Vitals;
  medications: Medication[];
  diagnoses: Diagnosis[];
  plan: string[];
  follow_up: FollowUp;
};

type UsageTotals = {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheWriteInputTokens: number;
};

type CaseInput = {
  id: string;
  transcript: string;
  prediction: unknown;
  gold: Extraction;
  usage?: UsageTotals;
  wallTimeMs?: number;
};

type FieldScores = {
  chiefComplaint: number;
  vitals: number;
  medications: { precision: number; recall: number; f1: number };
  diagnoses: { precision: number; recall: number; f1: number; icd10Bonus: number; score: number };
  plan: { precision: number; recall: number; f1: number };
  followUp: { intervalMatch: number; reasonScore: number; score: number };
};

type CaseEvaluation = {
  id: string;
  schemaValid: boolean;
  schemaErrors: string[];
  hallucinationCount: number;
  hallucinatedValues: string[];
  scores: FieldScores;
  overall: number;
  usage: UsageTotals;
  wallTimeMs: number;
};

type RunPricing = {
  inputPer1k: number;
  outputPer1k: number;
  cacheReadPer1k: number;
  cacheWritePer1k: number;
};

type RunEvaluation = {
  cases: CaseEvaluation[];
  aggregates: {
    chiefComplaint: number;
    vitals: number;
    medicationsF1: number;
    diagnosesF1: number;
    planF1: number;
    followUp: number;
    overall: number;
  };
  hallucinationCount: number;
  schemaFailureCount: number;
  usage: UsageTotals;
  wallTimeMs: number;
  totalCostUsd: number;
};

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateExtraction = ajv.compile(extractionSchema);

const DEFAULT_USAGE: UsageTotals = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheWriteInputTokens: 0,
};

const DEFAULT_PRICING: RunPricing = {
  inputPer1k: 0,
  outputPer1k: 0,
  cacheReadPer1k: 0,
  cacheWritePer1k: 0,
};

const FUZZY_THRESHOLD = 0.8;

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

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s./-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return new Set(normalizeText(value).split(" ").filter(Boolean));
}

function tokenSetRatio(a: string, b: string) {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);

  if (aTokens.size === 0 && bTokens.size === 0) {
    return 1;
  }

  if (aTokens.size === 0 || bTokens.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) {
      intersection += 1;
    }
  }

  return (2 * intersection) / (aTokens.size + bTokens.size);
}

function fuzzyScore(a: string, b: string) {
  const left = normalizeText(a);
  const right = normalizeText(b);

  if (!left && !right) {
    return 1;
  }

  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  return tokenSetRatio(left, right);
}

function isNumeric(value: string) {
  return /^\d+(?:\.\d+)?$/.test(value);
}

function isGroundedValue(value: string, transcriptNormalized: string, transcriptTokens: Set<string>) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return true;
  }

  if (isNumeric(normalized)) {
    return transcriptNormalized.includes(normalized);
  }

  if (normalized.length < 3) {
    return transcriptTokens.has(normalized);
  }

  if (transcriptNormalized.includes(normalized)) {
    return true;
  }

  const valueTokens = tokenize(normalized);
  if (valueTokens.size === 0) {
    return true;
  }

  let matched = 0;
  for (const token of valueTokens) {
    if (transcriptTokens.has(token)) {
      matched += 1;
    }
  }

  return matched / valueTokens.size >= 0.8;
}

function normalizeDose(value: string | null) {
  if (!value) {
    return null;
  }
  return normalizeText(value).replace(/\s+/g, "");
}

function normalizeFrequency(value: string | null) {
  if (!value) {
    return null;
  }

  let normalized = normalizeText(value);
  
  // Remove common filler words
  normalized = normalized.replace(/\b(once|twice|times|a|per|the)\b/g, "").trim();
  normalized = normalized.replace(/\s+/g, " ");

  const map: Record<string, string> = {
    bid: "daily", // Or "twice daily", but let's keep it simple for matching
    tid: "daily",
    qid: "daily",
    qd: "daily",
    qday: "daily",
    daily: "daily",
    qam: "morning",
    qpm: "evening",
    qhs: "nightly",
    nightly: "nightly",
    prn: "as needed",
  };

  return map[normalized] ?? normalized;
}

function compareVitals(predicted: Vitals, gold: Vitals) {
  const checks: number[] = [];

  checks.push(predicted.bp === gold.bp ? 1 : 0);
  
  const hrMatch = (predicted.hr !== null && gold.hr !== null)
    ? Math.abs(predicted.hr - gold.hr) <= 2
    : predicted.hr === gold.hr;
  checks.push(hrMatch ? 1 : 0);

  const tempMatch =
    predicted.temp_f !== null && gold.temp_f !== null
      ? Math.abs(predicted.temp_f - gold.temp_f) <= 0.2
      : predicted.temp_f === gold.temp_f;
  checks.push(tempMatch ? 1 : 0);

  const spo2Match = (predicted.spo2 !== null && gold.spo2 !== null)
    ? Math.abs(predicted.spo2 - gold.spo2) <= 1
    : predicted.spo2 === gold.spo2;
  checks.push(spo2Match ? 1 : 0);

  return checks.reduce((sum, value) => sum + value, 0) / checks.length;
}

function matchSet<T>(
  predicted: T[],
  gold: T[],
  predicate: (pred: T, gold: T) => boolean,
) {
  const used = new Set<number>();
  let matches = 0;

  for (const pred of predicted) {
    let matched = false;
    for (let i = 0; i < gold.length; i += 1) {
      if (used.has(i)) {
        continue;
      }
      const goldItem = gold[i];
      if (!goldItem) {
        continue;
      }
      if (predicate(pred, goldItem)) {
        used.add(i);
        matches += 1;
        matched = true;
        break;
      }
    }

    if (!matched) {
      continue;
    }
  }

  return matches;
}

export function precisionRecallF1(matches: number, predictedCount: number, goldCount: number) {
  const precision = predictedCount === 0 ? 1 : matches / predictedCount;
  const recall = goldCount === 0 ? 1 : matches / goldCount;
  const f1 =
    precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return { precision, recall, f1 };
}

function matchMed(pred: Medication, gold: Medication) {
  const nameScore = fuzzyScore(pred.name, gold.name);
  if (nameScore < FUZZY_THRESHOLD) {
    return false;
  }

  const doseMatch = normalizeDose(pred.dose) === normalizeDose(gold.dose);
  const freqMatch =
    normalizeFrequency(pred.frequency) === normalizeFrequency(gold.frequency);

  return doseMatch && freqMatch;
}

function matchDiagnosis(pred: Diagnosis, gold: Diagnosis) {
  return fuzzyScore(pred.description, gold.description) >= FUZZY_THRESHOLD;
}

function matchPlan(pred: string, gold: string) {
  return fuzzyScore(pred, gold) >= FUZZY_THRESHOLD;
}

function scoreFollowUp(predicted: FollowUp, gold: FollowUp) {
  const intervalMatch = predicted.interval_days === gold.interval_days ? 1 : 0;
  const reasonScore = fuzzyScore(predicted.reason ?? "", gold.reason ?? "");
  const score = (intervalMatch + reasonScore) / 2;
  return { intervalMatch, reasonScore, score };
}

function collectValues(value: unknown, results: string[] = []) {
  if (value === null || value === undefined) {
    return results;
  }

  if (typeof value === "string") {
    if (value.trim()) {
      results.push(value.trim());
    }
    return results;
  }

  if (typeof value === "number") {
    results.push(String(value));
    return results;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectValues(item, results);
    }
    return results;
  }

  if (typeof value === "object") {
    for (const entry of Object.values(value)) {
      collectValues(entry, results);
    }
    return results;
  }

  return results;
}

export function evaluateHallucinations(prediction: Extraction, transcript: string) {
  const transcriptNormalized = normalizeText(transcript);
  const transcriptTokens = tokenize(transcriptNormalized);

  const values = collectValues(prediction);
  const hallucinated = values.filter(
    (value) => !isGroundedValue(value, transcriptNormalized, transcriptTokens),
  );

  return {
    hallucinatedValues: hallucinated,
    hallucinationCount: hallucinated.length,
  };
}

function scoreChiefComplaint(predicted: string, gold: string) {
  return fuzzyScore(predicted, gold);
}

function scoreMedications(predicted: Medication[], gold: Medication[]) {
  const matches = matchSet(predicted, gold, matchMed);
  return precisionRecallF1(matches, predicted.length, gold.length);
}

function scoreDiagnoses(predicted: Diagnosis[], gold: Diagnosis[]) {
  const matches = matchSet(predicted, gold, matchDiagnosis);
  const base = precisionRecallF1(matches, predicted.length, gold.length);

  let icd10Matches = 0;
  for (const pred of predicted) {
    for (const goldItem of gold) {
      if (matchDiagnosis(pred, goldItem) && pred.icd10 && goldItem.icd10) {
        if (normalizeText(pred.icd10) === normalizeText(goldItem.icd10)) {
          icd10Matches += 1;
          break;
        }
      }
    }
  }

  const icd10Bonus = gold.length === 0 ? 0 : icd10Matches / gold.length;
  const score = Math.min(1, base.f1 + icd10Bonus * 0.1);

  return { ...base, icd10Bonus, score };
}

function scorePlan(predicted: string[], gold: string[]) {
  const matches = matchSet(predicted, gold, matchPlan);
  return precisionRecallF1(matches, predicted.length, gold.length);
}

function toExtraction(value: unknown): Extraction | null {
  if (value && typeof value === "object" && validateExtraction(value)) {
    return value as Extraction;
  }
  return null;
}

export function evaluateCase(input: CaseInput): CaseEvaluation {
  const schemaValid = validateExtraction(input.prediction);
  const schemaErrors = schemaValid ? [] : formatAjvErrors(validateExtraction.errors);
  const prediction = toExtraction(input.prediction) ?? {
    chief_complaint: "",
    vitals: { bp: null, hr: null, temp_f: null, spo2: null },
    medications: [],
    diagnoses: [],
    plan: [],
    follow_up: { interval_days: null, reason: null },
  };

  const hallucination = evaluateHallucinations(prediction, input.transcript);

  const chiefComplaint = scoreChiefComplaint(prediction.chief_complaint, input.gold.chief_complaint);
  const vitals = compareVitals(prediction.vitals, input.gold.vitals);
  const medications = scoreMedications(prediction.medications, input.gold.medications);
  const diagnoses = scoreDiagnoses(prediction.diagnoses, input.gold.diagnoses);
  const plan = scorePlan(prediction.plan, input.gold.plan);
  const followUp = scoreFollowUp(prediction.follow_up, input.gold.follow_up);

  const overall =
    (chiefComplaint + vitals + medications.f1 + diagnoses.score + plan.f1 + followUp.score) /
    6;

  return {
    id: input.id,
    schemaValid,
    schemaErrors,
    hallucinationCount: hallucination.hallucinationCount,
    hallucinatedValues: hallucination.hallucinatedValues,
    scores: {
      chiefComplaint,
      vitals,
      medications,
      diagnoses,
      plan,
      followUp,
    },
    overall,
    usage: input.usage ?? DEFAULT_USAGE,
    wallTimeMs: input.wallTimeMs ?? 0,
  };
}

export function evaluateRun(params: {
  cases: CaseInput[];
  pricing?: Partial<RunPricing>;
  wallTimeMs?: number;
}): RunEvaluation {
  const pricing = { ...DEFAULT_PRICING, ...params.pricing };
  const cases = params.cases.map(evaluateCase);

  const aggregates = cases.reduce(
    (totals, item) => {
      totals.chiefComplaint += item.scores.chiefComplaint;
      totals.vitals += item.scores.vitals;
      totals.medicationsF1 += item.scores.medications.f1;
      totals.diagnosesF1 += item.scores.diagnoses.f1;
      totals.planF1 += item.scores.plan.f1;
      totals.followUp += item.scores.followUp.score;
      totals.overall += item.overall;
      return totals;
    },
    {
      chiefComplaint: 0,
      vitals: 0,
      medicationsF1: 0,
      diagnosesF1: 0,
      planF1: 0,
      followUp: 0,
      overall: 0,
    },
  );

  const count = cases.length || 1;
  const normalizedAggregates = {
    chiefComplaint: aggregates.chiefComplaint / count,
    vitals: aggregates.vitals / count,
    medicationsF1: aggregates.medicationsF1 / count,
    diagnosesF1: aggregates.diagnosesF1 / count,
    planF1: aggregates.planF1 / count,
    followUp: aggregates.followUp / count,
    overall: aggregates.overall / count,
  };

  const totals = cases.reduce(
    (usage, item) => {
      usage.inputTokens += item.usage.inputTokens;
      usage.outputTokens += item.usage.outputTokens;
      usage.cacheReadInputTokens += item.usage.cacheReadInputTokens;
      usage.cacheWriteInputTokens += item.usage.cacheWriteInputTokens;
      return usage;
    },
    { ...DEFAULT_USAGE },
  );

  const hallucinationCount = cases.reduce(
    (sum, item) => sum + item.hallucinationCount,
    0,
  );
  const schemaFailureCount = cases.reduce((sum, item) => sum + (item.schemaValid ? 0 : 1), 0);
  const wallTimeMs = params.wallTimeMs ?? cases.reduce((sum, item) => sum + item.wallTimeMs, 0);

  const totalCostUsd =
    (totals.inputTokens / 1000) * pricing.inputPer1k +
    (totals.outputTokens / 1000) * pricing.outputPer1k +
    (totals.cacheReadInputTokens / 1000) * pricing.cacheReadPer1k +
    (totals.cacheWriteInputTokens / 1000) * pricing.cacheWritePer1k;

  return {
    cases,
    aggregates: normalizedAggregates,
    hallucinationCount,
    schemaFailureCount,
    usage: totals,
    wallTimeMs,
    totalCostUsd,
  };
}
