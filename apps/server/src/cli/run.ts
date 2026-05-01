import { startRun, subscribeRun } from "../services/runner.service";

const strategy = process.argv[2] || "zero_shot";
const model = process.argv[3] || "claude-haiku-4-5-20251001";

console.log(`🚀 Starting evaluation run...`);
console.log(`   Strategy: ${strategy}`);
console.log(`   Model:    ${model}\n`);

try {
  const runId = await startRun({
    strategy,
    model,
  });

  console.log(`✅ Run created: ID ${runId}`);
  console.log(`📊 Follow progress at: http://localhost:3001/dashboard/eval/${runId}\n`);

  subscribeRun(runId, (event) => {
    if (event.type === "case-complete") {
      process.stdout.write(`\rProgress: [${event.completed}/${event.total}] cases completed...`);
    } else if (event.type === "run-complete") {
      console.log(`\n\n✨ Run finished successfully!`);
      process.exit(0);
    } else if (event.type === "run-error") {
      console.error(`\n\n❌ Run failed: ${event.message}`);
      process.exit(1);
    }
  });
} catch (err) {
  console.error(`\n\n❌ Failed to start run:`, err);
  process.exit(1);
}
