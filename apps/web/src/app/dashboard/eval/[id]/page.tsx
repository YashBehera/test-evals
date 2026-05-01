"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { EvaluationRun, EvaluationCase } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@test-evals/ui/components/card";
import { Button } from "@test-evals/ui/components/button";
import { ChevronLeft, CheckCircle2, XCircle, AlertTriangle, Clock, DollarSign, Activity, RotateCcw } from "lucide-react";
import Link from "next/link";

export default function RunDetailPage() {
  const params = useParams();
  const runId = Number(params.id);
  
  const [run, setRun] = useState<EvaluationRun | null>(null);
  const [cases, setCases] = useState<EvaluationCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await apiFetch<{ run: EvaluationRun; cases: EvaluationCase[] }>(`/api/v1/evaluate/runs/${runId}`);
        setRun(data.run);
        setCases(data.cases || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load run details");
      } finally {
        setLoading(false);
      }
    }
    if (runId) load();
  }, [runId]);

  if (loading) return <div className="p-8 text-center text-white">Loading run detail...</div>;
  if (error || !run) return <div className="p-8 text-center text-red-500">{error || "Run not found"}</div>;

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Evaluation Run #{run.id}</h1>
        <div className="mt-2 flex flex-wrap gap-4 text-sm text-zinc-400">
          <span className="flex items-center gap-1.5">
            <Activity className="h-4 w-4" />
            Strategy: <span className="text-indigo-400 font-medium">{run.strategy}</span>
          </span>
          <span className="flex items-center gap-1.5 font-mono text-xs">
            Hash: <span className="text-zinc-300">{run.promptHash || 'N/A'}</span>
          </span>
          <span className="flex items-center gap-1.5">
            Model: <span className="text-zinc-300">{run.model}</span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => window.location.reload()}
          className="border-zinc-800 text-zinc-400 hover:text-white"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Refresh Data
        </Button>
        <Link href="/dashboard" className="inline-flex items-center text-sm text-zinc-400 hover:text-white">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back to Dashboard
        </Link>
      </div>

      <div className="mb-8 grid gap-6 md:grid-cols-4">
        <StatCard title="Overall Score" value={`${((getMetric(run.aggregates, 'overall')) * 100).toFixed(1)}%`} icon={<Activity className="text-emerald-400" />} />
        <StatCard title="Total Cost" value={`$${(run.totalCostUsd ?? 0).toFixed(4)}`} icon={<DollarSign className="text-amber-400" />} />
        <StatCard title="Duration" value={`${((run.wallTimeMs ?? 0) / 1000).toFixed(1)}s`} icon={<Clock className="text-blue-400" />} />
        <StatCard title="Cases" value={(run.caseCount ?? 0).toString()} icon={<CheckCircle2 className="text-indigo-400" />} />
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-zinc-800 bg-zinc-900/50">
          <CardHeader>
            <CardTitle className="text-white">Cases Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400">
                    <th className="px-3 py-2">ID</th>
                    <th className="px-3 py-2 text-center">Score</th>
                    <th className="px-3 py-2 text-center">Schema</th>
                    <th className="px-3 py-2 text-center">Halluc.</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {cases.map((c) => (
                    <tr key={c.id} className="hover:bg-zinc-800/30">
                      <td className="px-3 py-3 font-mono text-xs text-zinc-400">{c.caseId}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`font-bold ${c.overall > 0.8 ? "text-emerald-400" : c.overall > 0.5 ? "text-amber-400" : "text-red-400"}`}>
                          {(c.overall * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {c.schemaValid ? (
                          <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" />
                        ) : (
                          <XCircle className="mx-auto h-4 w-4 text-red-500" />
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {c.hallucinationCount > 0 ? (
                          <span className="inline-flex items-center rounded bg-red-500/10 px-1.5 py-0.5 text-xs text-red-400">
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            {c.hallucinationCount}
                          </span>
                        ) : (
                          <span className="text-zinc-600">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Link href={`/dashboard/eval/${runId}/case/${c.caseId}`}>
                          <Button variant="ghost" size="sm">Inspect</Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-zinc-400">Aggregate Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <MetricProgress label="Chief Complaint" value={getMetric(run.aggregates, 'chiefComplaint')} />
            <MetricProgress label="Vitals" value={getMetric(run.aggregates, 'vitals')} />
            <MetricProgress label="Medications F1" value={getMetric(run.aggregates, 'medicationsF1')} />
            <MetricProgress label="Diagnoses F1" value={getMetric(run.aggregates, 'diagnosesF1')} />
            <MetricProgress label="Plan F1" value={getMetric(run.aggregates, 'planF1')} />
            <MetricProgress label="Follow-up" value={getMetric(run.aggregates, 'followUp')} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-20 border-t border-zinc-800 pt-10 pb-20">
        <details className="text-xs text-zinc-600">
          <summary className="cursor-pointer hover:text-zinc-400 uppercase tracking-widest font-bold">Debug Data (Raw JSON)</summary>
          <pre className="mt-4 p-4 bg-black rounded overflow-x-auto text-zinc-500">
            {JSON.stringify({ aggregates: run.aggregates }, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}

function getMetric(aggregates: any, key: string): number {
  if (!aggregates) return 0;
  const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  return aggregates[key] ?? aggregates[snakeKey] ?? 0;
}

function MetricProgress({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-400 font-medium">{label}</span>
        <span className="text-white font-bold">{(value * 100).toFixed(1)}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
        <div 
          className="h-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)] transition-all duration-1000" 
          style={{ width: `${value * 100}%` }}
        />
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-sm group hover:border-zinc-700 transition-all">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 group-hover:text-zinc-400 transition-colors">{title}</p>
          <div className="p-2 bg-zinc-950 rounded-lg border border-zinc-800">{icon}</div>
        </div>
        <p className="text-2xl font-black text-white">{value}</p>
      </CardContent>
    </Card>
  );
}
