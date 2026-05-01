import { extractTranscript, type ExtractStrategy } from "../services/extract.service";
import { recordExtractionRun } from "../services/extraction-run.service";

type ArgMap = Record<string, string | true>;

function parseArgs(argv: string[]) {
  return argv.reduce<ArgMap>((acc, arg) => {
    if (!arg.startsWith("--")) {
      return acc;
    }
    const [key, value] = arg.slice(2).split("=");
    if (!key) {
      return acc;
    }
    acc[key] = value ?? true;
    return acc;
  }, {});
}

function formatUsage(usage: {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheWriteInputTokens: number;
}) {
  return [
    `input_tokens=${usage.inputTokens}`,
    `output_tokens=${usage.outputTokens}`,
    `cache_read_input_tokens=${usage.cacheReadInputTokens}`,
    `cache_write_input_tokens=${usage.cacheWriteInputTokens}`,
  ].join("\n");
}

const args = parseArgs(Bun.argv.slice(2));
const filePath = typeof args.file === "string" ? args.file : "";
const strategyInput = typeof args.strategy === "string" ? args.strategy : "zero_shot";
const strategy: ExtractStrategy =
  strategyInput === "zero_shot" || strategyInput === "few_shot" || strategyInput === "cot"
    ? strategyInput
    : "zero_shot";
const model = typeof args.model === "string" ? args.model : "claude-haiku-4-5-20251001";

if (!filePath) {
  console.error("Missing --file=path/to/transcript.txt");
  process.exit(1);
}

const file = Bun.file(filePath);
const transcript = await file.text();

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
});

console.log(`run_id=${runId ?? "n/a"}`);
console.log(`success=${result.success}`);
console.log(`attempts=${result.attempts.length}`);
console.log(`duration_ms=${durationMs}`);
console.log(formatUsage(result.usage));

if (!result.success) {
  console.log("schema_errors:");
  for (const error of result.schemaErrors) {
    console.log(`- ${error}`);
  }
}

console.log("output:");
console.log(JSON.stringify(result.output, null, 2));
