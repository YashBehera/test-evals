import { startRun, subscribeRun } from "../services/runner.service";
import { getEvaluationRun } from "../services/evaluation-run.service";
import { parseArgs } from "util";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    strategy: { type: "string", default: "zero_shot" },
    model: { type: "string", default: "claude-haiku-4-5-20251001" },
    limit: { type: "string" },
  },
  strict: false,
});

const strategy = values.strategy as string;
const model = values.model as string;
const limit = values.limit ? Number(values.limit) : undefined;

console.log(`\n🚀 Starting Evaluation: ${strategy} (${model})`);

try {
  const runId = await startRun({ 
    strategy, 
    model, 
    datasetFilter: limit ? { limit } : undefined 
  });
  console.log(`✅ Run initiated: ID #${runId}`);

  subscribeRun(runId, async (event) => {
    if (event.type === "case-complete") {
      const pct = Math.round((event.completed / event.total) * 100);
      process.stdout.write(`\rProgress: [${event.completed}/${event.total}] ${pct}% completed...`);
    } else if (event.type === "run-complete") {
      console.log(`\n\n✨ Run Finished! Fetching summary...\n`);
      
      const result = await getEvaluationRun(runId);
      if (!result) {
        console.error(`❌ Could not find run ${runId}`);
        process.exit(1);
      }
      const { run } = result;
      
      console.log("=================================================");
      console.log(`EVALUATION SUMMARY: #${run.id} [${run.promptHash || 'N/A'}]`);
      console.log(`Strategy: ${run.strategy} | Model: ${run.model}`);
      console.log("-------------------------------------------------");
      
      const aggregates = run.aggregates as any;
      const tableData = [
        { Metric: "Chief Complaint", Score: `${(aggregates.chiefComplaint * 100).toFixed(1)}%` },
        { Metric: "Vitals", Score: `${(aggregates.vitals * 100).toFixed(1)}%` },
        { Metric: "Medications F1", Score: `${(aggregates.medicationsF1 * 100).toFixed(1)}%` },
        { Metric: "Diagnoses F1", Score: `${(aggregates.diagnosesF1 * 100).toFixed(1)}%` },
        { Metric: "Plan F1", Score: `${(aggregates.planF1 * 100).toFixed(1)}%` },
        { Metric: "Follow-up", Score: `${(aggregates.followUp * 100).toFixed(1)}%` },
        { Metric: "OVERALL SCORE", Score: `${(aggregates.overall * 100).toFixed(1)}%` },
      ];
      
      console.table(tableData);
      
      console.log("-------------------------------------------------");
      console.log(`Total Cost:   $${run.totalCostUsd.toFixed(4)}`);
      console.log(`Wall Time:    ${(run.wallTimeMs / 1000).toFixed(1)}s`);
      console.log(`Cases:        ${run.caseCount}`);
      console.log("=================================================\n");
      
      process.exit(0);
    } else if (event.type === "run-error") {
      console.error(`\n\n❌ Run failed: ${event.message}`);
      process.exit(1);
    }
  });
} catch (err) {
  console.error(`\n\n❌ Initialization failed:`, err);
  process.exit(1);
}
