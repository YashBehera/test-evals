"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { ExtractionRun } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@test-evals/ui/components/card";
import { Button } from "@test-evals/ui/components/button";
import { RotateCcw, ChevronRight } from "lucide-react";
import Link from "next/link";

export function ExtractionRunsTable() {
  const [runs, setRuns] = useState<ExtractionRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      const data = await apiFetch<{ runs: ExtractionRun[] }>("/api/v1/extract/runs");
      setRuns(data.runs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load extractions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <div className="p-8 text-center text-zinc-500">Loading extraction runs...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  return (
    <Card className="mt-8 border-none bg-zinc-900/50 shadow-2xl backdrop-blur-md">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-xl font-bold tracking-tight text-white">Extraction Runs</CardTitle>
        <Button variant="outline" size="sm" onClick={load} className="border-zinc-700 hover:bg-zinc-800">
          <RotateCcw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400">
                <th className="px-4 py-3 font-medium">Run ID</th>
                <th className="px-4 py-3 font-medium">Strategy</th>
                <th className="px-4 py-3 font-medium">Model</th>
                <th className="px-4 py-3 font-medium text-center">Attempts</th>
                <th className="px-4 py-3 font-medium text-center">Tokens (Out)</th>
                <th className="px-4 py-3 font-medium text-center">Duration</th>
                <th className="px-4 py-3 font-medium text-center">Status</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {runs.map((run) => (
                <tr key={run.id} className="group hover:bg-zinc-800/50 transition-colors">
                  <td className="px-4 py-4 font-mono text-zinc-500">#{run.id}</td>
                  <td className="px-4 py-4">
                    <span className="rounded-full bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-400">
                      {run.strategy}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-zinc-400 font-mono text-xs">
                    {run.model}
                  </td>
                  <td className="px-4 py-4 text-center text-zinc-300">
                    {run.attempts}
                  </td>
                  <td className="px-4 py-4 text-center text-zinc-400 font-mono text-xs">
                    {run.outputTokens}
                  </td>
                  <td className="px-4 py-4 text-center text-zinc-400">
                    {((run.durationMs || 0) / 1000).toFixed(1)}s
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      run.status === "success" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                    }`}>
                      {run.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <Link href={`/dashboard/extract/${run.id}`}>
                      <Button variant="ghost" size="sm" className="hover:bg-zinc-700">
                        View
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {runs.length === 0 && (
            <div className="py-12 text-center text-zinc-500">
              No extraction runs found.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
