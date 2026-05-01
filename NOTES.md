# Implementation Notes & Results

## Implementation Summary

The clinical extraction evaluation harness is fully implemented with the following components:

1.  **Extractor Service**: Supports swappable strategies (Zero-shot, Few-shot, Chain-of-Thought), Anthropic tool use, retry-with-feedback loops, and prompt caching.
2.  **Evaluator Service**: Performs field-level scoring, hallucination detection (grounding checks), and cost/token tracking.
3.  **Runner Service**: Handles concurrent execution (semaphore-limited), rate limiting with backoff, resumability, and result caching.
4.  **Web Dashboard**: Professional UI for monitoring runs, deep-diving into specific cases (with JSON diffs and LLM traces), and comparing strategy performance.
5.  **CLI**: A command-line interface for running evaluations directly.

## CLI Usage

To run an evaluation from the CLI:

```bash
bun install
bun run eval -- --strategy=zero_shot
```

Supported flags:
- `--strategy`: `zero_shot` (default), `few_shot`, `cot`
- `--model`: Defaults to `claude-haiku-4-5-20251001`
- `--limit`: Number of cases to run (e.g., `--limit=5`)

---

## Deployment Instructions

### 1. Backend (Railway)
I have included a `railway.json` and `Procfile` in `apps/server` for seamless deployment.
- **Root Directory**: Set to `apps/server` in Railway service settings.
- **Build Command**: `cd ../.. && bun install && bun x turbo run build --filter=server`
- **Start Command**: `bun run dist/index.mjs`
- **Environment Variables**:
  - `PORT`: 8787 (or your preferred port)
  - `DATABASE_URL`: Your Postgres connection string.
  - `ANTHROPIC_API_KEY`: Your API key.

### 2. Frontend (Vercel)
- **Root Directory**: `apps/web`
- **Build Command**: `cd ../.. && bun install && bun x turbo run build --filter=web`
- **Output Directory**: `.next`
- **Environment Variables**:
  - `NEXT_PUBLIC_API_URL`: Your deployed Railway URL.
  - `BETTER_AUTH_URL`: Your Vercel deployment URL.

## Evaluation Results (3-Strategy Run)

> [!NOTE]
> The results below were generated using a **Mock LLM fallback**. The actual Anthropic model requires credits which are currently exhausted in the account. The scores reflect the output of a deterministic mock extractor designed for system validation.

Below is the output from a full run across all three strategies.

### 1. ZERO SHOT RUN
```
🚀 Starting Evaluation: zero_shot (claude-haiku-4-5-20251001)
✅ Run initiated: ID #25
Progress: [50/50] 100% completed...

✨ Run Finished! Fetching summary...

=================================================
EVALUATION SUMMARY: #25 [25447a75005d]
Strategy: zero_shot | Model: claude-haiku-4-5-20251001
-------------------------------------------------
┌───┬─────────────────┬────────┐
│   │ Metric          │ Score  │
├───┼─────────────────┼────────┤
│ 0 │ Chief Complaint │ 11.9%  │
│ 1 │ Vitals          │ 100.0% │
│ 2 │ Medications F1  │ 4.0%   │
│ 3 │ Diagnoses F1    │ 0.0%   │
│ 4 │ Plan F1         │ 0.0%   │
│ 5 │ Follow-up       │ 27.0%  │
│ 6 │ OVERALL SCORE   │ 23.8%  │
└───┴─────────────────┴────────┘
-------------------------------------------------
Total Cost:   $0.0000
Wall Time:    16.5s
Cases:        50
=================================================
```

### 2. FEW SHOT RUN
```
🚀 Starting Evaluation: few_shot (claude-haiku-4-5-20251001)
✅ Run initiated: ID #26
Progress: [50/50] 100% completed...

✨ Run Finished! Fetching summary...

=================================================
EVALUATION SUMMARY: #26 [6f03d9808d44]
Strategy: few_shot | Model: claude-haiku-4-5-20251001
-------------------------------------------------
┌───┬─────────────────┬────────┐
│   │ Metric          │ Score  │
├───┼─────────────────┼────────┤
│ 0 │ Chief Complaint │ 11.9%  │
│ 1 │ Vitals          │ 100.0% │
│ 2 │ Medications F1  │ 4.0%   │
│ 3 │ Diagnoses F1    │ 0.0%   │
│ 4 │ Plan F1         │ 0.0%   │
│ 5 │ Follow-up       │ 27.0%  │
│ 6 │ OVERALL SCORE   │ 23.8%  │
└───┴─────────────────┴────────┘
-------------------------------------------------
Total Cost:   $0.0000
Wall Time:    16.9s
Cases:        50
=================================================
```

### 3. COT RUN
```
🚀 Starting Evaluation: cot (claude-haiku-4-5-20251001)
✅ Run initiated: ID #27
Progress: [50/50] 100% completed...

✨ Run Finished! Fetching summary...

=================================================
EVALUATION SUMMARY: #27 [82b526691312]
Strategy: cot | Model: claude-haiku-4-5-20251001
-------------------------------------------------
┌───┬─────────────────┬────────┐
│   │ Metric          │ Score  │
├───┼─────────────────┼────────┤
│ 0 │ Chief Complaint │ 11.9%  │
│ 1 │ Vitals          │ 100.0% │
│ 2 │ Medications F1  │ 4.0%   │
│ 3 │ Diagnoses F1    │ 0.0%   │
│ 4 │ Plan F1         │ 0.0%   │
│ 5 │ Follow-up       │ 27.0%  │
│ 6 │ OVERALL SCORE   │ 23.8%  │
└───┴─────────────────┴────────┘
-------------------------------------------------
Total Cost:   $0.0000
Wall Time:    17.9s
Cases:        50
=================================================
```

---

## Reflections

### 1. What Surprised Me
- **Grounding Complexity**: Implementing a "simple" grounding check for hallucinations was more nuanced than expected. Balancing strict substring matching with normalized token-set ratios was necessary to avoid flagging valid but slightly rephrased extractions (e.g., "BID" vs "twice daily").
- **Streaming State Management**: Managing SSE (Server-Sent Events) across multiple concurrent runs while maintaining a responsive dashboard required careful design of the subscriber/publisher pattern to avoid memory leaks and ensure cases didn't get "lost" in the UI.

### 2. What I'd Build Next
- **Monte Carlo Evaluations**: Implement a "best of N" strategy where the model runs 3-5 times per case, and a majority-vote or another LLM-as-a-judge selects the most consistent extraction.
- **Live Prompt Playground**: Add a feature to the dashboard where users can tweak the system prompt or few-shot examples and run a "mini-eval" on 5-10 cases instantly to see the impact before committing to a full run.
- **Semantic Similarity Scoring**: Move beyond fuzzy/token matching for text fields like `plan` and `chief_complaint` by using embeddings to calculate semantic similarity, which would better handle synonyms.

### 3. What I Cut
- **ICD-10 Auto-complete**: While the evaluator handles ICD-10 bonuses, I cut the integration of a live ICD-10 lookup API to focus on the core evaluation harness robustness.
- **Real-time Charting**: I prioritized high-density data tables and delta visualizations over complex scatter plots or trend graphs to ensure the comparison view remained intuitive and fast.
- **Complex RBAC**: Basic authentication is integrated, but I cut fine-grained permissions (e.g., "Editor" vs "Viewer") to focus on the end-to-end evaluation flow.

