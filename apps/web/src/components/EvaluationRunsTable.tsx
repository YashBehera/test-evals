"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { EvaluationRun } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@test-evals/ui/components/card";
import { Button } from "@test-evals/ui/components/button";
import { Play, RotateCcw, ChevronRight, BarChart3 } from "lucide-react";
import Link from "next/link";

export function EvaluationRunsTable() {
  const [runs, setRuns] = useState<EvaluationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      const data = await apiFetch<{ runs: EvaluationRun[] }>("/api/v1/evaluate/runs");
      setRuns(data.runs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load runs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <div className="p-8 text-center">Loading evaluation runs...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  return (
    <Card className="mt-8 border-none bg-zinc-900/50 shadow-2xl backdrop-blur-md">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-xl font-bold tracking-tight text-white">Evaluation Runs</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} className="border-zinc-700 hover:bg-zinc-800">
            <RotateCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Link href="/dashboard/compare">
            <Button variant="outline" size="sm" className="border-zinc-700 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20">
              <BarChart3 className="mr-2 h-4 w-4" />
              Compare Runs
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400">
                <th className="px-4 py-3 font-medium">Run ID</th>
                <th className="px-4 py-3 font-medium">Strategy</th>
                <th className="px-4 py-3 font-medium">Prompt Hash</th>
                <th className="px-4 py-3 font-medium text-center">Overall F1</th>
                <th className="px-4 py-3 font-medium text-center">Cost</th>
                <th className="px-4 py-3 font-medium text-center">Duration</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {runs.map((run) => (
                <tr key={run.id} className="group hover:bg-zinc-800/50 transition-colors">
                  <td className="px-4 py-4 font-mono text-zinc-500">#{run.id}</td>
                  <td className="px-4 py-4">
                    <span className="rounded-full bg-indigo-500/10 px-2 py-1 text-xs font-medium text-indigo-400">
                      {run.strategy}
                    </span>
                  </td>
                  <td className="px-4 py-4 font-mono text-xs text-zinc-500">
                    {run.promptHash || "N/A"}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div className="flex flex-col items-center">
                      <span className="text-lg font-bold text-white">
                        {((run.aggregates?.overall ?? 0) * 100).toFixed(1)}%
                      </span>
                      <div className="h-1 w-12 rounded-full bg-zinc-800 overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500" 
                          style={{ width: `${(run.aggregates?.overall ?? 0) * 100}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center text-zinc-400">
                    ${run.totalCostUsd.toFixed(4)}
                  </td>
                  <td className="px-4 py-4 text-center text-zinc-400">
                    {(run.wallTimeMs / 1000).toFixed(1)}s
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      run.status === "completed" ? "bg-emerald-500/10 text-emerald-400" :
                      run.status === "running" ? "bg-amber-500/10 text-amber-400 animate-pulse" :
                      "bg-zinc-800 text-zinc-500"
                    }`}>
                      {run.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <Link href={`/dashboard/eval/${run.id}`}>
                      <Button variant="ghost" size="sm" className="hover:bg-zinc-700">
                        Details
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
              No evaluation runs found.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
