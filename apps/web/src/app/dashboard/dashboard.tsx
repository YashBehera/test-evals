"use client";

import { env } from "@test-evals/env/web";
import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";

type ExtractionRun = {
  id: number;
  strategy: string;
  model: string;
  status: string;
  attempts: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheWriteInputTokens: number;
  durationMs: number | null;
  createdAt: string;
};

export default function Dashboard({ session }: { session: typeof authClient.$Infer.Session }) {
  const [runs, setRuns] = useState<ExtractionRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadRuns() {
      try {
        const response = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/v1/extract/runs`, {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error(`Request failed with ${response.status}`);
        }

        const payload = (await response.json()) as { runs: ExtractionRun[] };
        if (isMounted) {
          setRuns(payload.runs ?? []);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load runs");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadRuns();

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return <p>Loading runs...</p>;
  }

  if (error) {
    return <p>Failed to load runs: {error}</p>;
  }

  if (runs.length === 0) {
    return <p>No extraction runs yet.</p>;
  }

  return (
    <div className="mt-6">
      <h2 className="text-lg font-semibold">Recent Extraction Runs</h2>
      <div className="mt-4 overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="border-b px-3 py-2">Run ID</th>
              <th className="border-b px-3 py-2">Strategy</th>
              <th className="border-b px-3 py-2">Model</th>
              <th className="border-b px-3 py-2">Status</th>
              <th className="border-b px-3 py-2">Attempts</th>
              <th className="border-b px-3 py-2">Input</th>
              <th className="border-b px-3 py-2">Output</th>
              <th className="border-b px-3 py-2">Cache Read</th>
              <th className="border-b px-3 py-2">Cache Write</th>
              <th className="border-b px-3 py-2">Duration (ms)</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} className="border-b last:border-0">
                <td className="px-3 py-2">{run.id}</td>
                <td className="px-3 py-2">{run.strategy}</td>
                <td className="px-3 py-2">{run.model}</td>
                <td className="px-3 py-2">{run.status}</td>
                <td className="px-3 py-2">{run.attempts}</td>
                <td className="px-3 py-2">{run.inputTokens}</td>
                <td className="px-3 py-2">{run.outputTokens}</td>
                <td className="px-3 py-2">{run.cacheReadInputTokens}</td>
                <td className="px-3 py-2">{run.cacheWriteInputTokens}</td>
                <td className="px-3 py-2">{run.durationMs ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
