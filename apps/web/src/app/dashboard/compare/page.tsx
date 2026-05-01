"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { EvaluationRun } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@test-evals/ui/components/card";
import { Button } from "@test-evals/ui/components/button";
import { ChevronLeft, ArrowRight, TrendingUp, TrendingDown, Minus, Trophy, Target } from "lucide-react";
import Link from "next/link";

export default function ComparePage() {
  const [runs, setRuns] = useState<EvaluationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [runAId, setRunAId] = useState<number | null>(null);
  const [runBId, setRunBId] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await apiFetch<{ runs: EvaluationRun[] }>("/api/v1/evaluate/runs");
        setRuns(data.runs);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const runA = runs.find(r => r.id === runAId);
  const runB = runs.find(r => r.id === runBId);

  if (loading) return <div className="p-8 text-center text-white">Loading runs for comparison...</div>;

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <Link href="/dashboard" className="mb-6 inline-flex items-center text-sm text-zinc-400 hover:text-white">
        <ChevronLeft className="mr-1 h-4 w-4" />
        Back to Dashboard
      </Link>

      <div className="mb-8 flex flex-col gap-4">
        <h1 className="text-3xl font-bold text-white">Strategy Comparison</h1>
        <p className="text-zinc-400 text-sm">Select two evaluation runs to analyze performance deltas across all clinical fields.</p>
      </div>

      <div className="mb-12 grid gap-6 md:grid-cols-2">
        <RunSelector label="Run A (Baseline)" runs={runs} selectedId={runAId} onSelect={setRunAId} />
        <RunSelector label="Run B (Candidate)" runs={runs} selectedId={runBId} onSelect={setRunBId} />
      </div>

      {runA && runB ? (
        <ComparisonResults runA={runA} runB={runB} />
      ) : (
        <div className="py-24 text-center border-2 border-dashed border-zinc-800 rounded-2xl">
          <Target className="mx-auto h-12 w-12 text-zinc-700 mb-4" />
          <p className="text-zinc-500">Select two runs to see the analysis</p>
        </div>
      )}
    </div>
  );
}

function RunSelector({ label, runs, selectedId, onSelect }: { label: string; runs: EvaluationRun[]; selectedId: number | null; onSelect: (id: number) => void }) {
  return (
    <Card className="border-zinc-800 bg-zinc-900/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-bold uppercase tracking-widest text-zinc-500">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <select 
          value={selectedId || ""} 
          onChange={(e) => onSelect(Number(e.target.value))}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
        >
          <option value="">Select a run...</option>
          {runs.map(r => (
            <option key={r.id} value={r.id}>
              #{r.id} - {r.strategy} ({r.model}) - {(r.aggregates.overall * 100).toFixed(1)}%
            </option>
          ))}
        </select>
      </CardContent>
    </Card>
  );
}

function ComparisonResults({ runA, runB }: { runA: EvaluationRun; runB: EvaluationRun }) {
  const fields = [
    { key: "chiefComplaint", label: "Chief Complaint" },
    { key: "vitals", label: "Vitals" },
    { key: "medicationsF1", label: "Medications F1" },
    { key: "diagnosesF1", label: "Diagnoses F1" },
    { key: "planF1", label: "Plan F1" },
    { key: "followUp", label: "Follow-up" },
    { key: "overall", label: "Overall Score" },
  ];

  const overallDelta = runB.aggregates.overall - runA.aggregates.overall;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2 border-zinc-800 bg-indigo-500/5">
          <CardContent className="p-8 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase text-indigo-400 mb-1">Overall Delta</p>
              <h2 className={`text-5xl font-black ${overallDelta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {overallDelta >= 0 ? "+" : ""}{(overallDelta * 100).toFixed(2)}%
              </h2>
            </div>
            <div className="text-right">
              <p className="text-xs text-zinc-500 mb-2">Winner Strategy</p>
              <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900 rounded-full border border-zinc-800 shadow-xl">
                <Trophy className="h-5 w-5 text-amber-400" />
                <span className="font-bold text-white uppercase tracking-wider">{overallDelta >= 0 ? runB.strategy : runA.strategy}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardContent className="p-6">
            <p className="text-xs font-bold uppercase text-zinc-500 mb-4">Cost/Perf Efficiency</p>
            <div className="space-y-4">
               <div>
                  <p className="text-[10px] text-zinc-600 uppercase font-bold">Cost B / Cost A</p>
                  <p className="text-lg font-mono text-zinc-300">{(runB.totalCostUsd / (runA.totalCostUsd || 1)).toFixed(2)}x</p>
               </div>
               <div>
                  <p className="text-[10px] text-zinc-600 uppercase font-bold">Latency Delta</p>
                  <p className="text-lg font-mono text-zinc-300">{((runB.wallTimeMs - runA.wallTimeMs)/1000).toFixed(1)}s</p>
               </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-zinc-800 bg-zinc-900/50 overflow-hidden">
        <CardHeader className="bg-zinc-800/20 py-4">
          <CardTitle className="text-sm font-bold text-zinc-400 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Field-Level Performance Delta
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-[10px] uppercase tracking-widest font-bold">
                <th className="px-6 py-4">Clinical Field</th>
                <th className="px-6 py-4 text-center">Baseline (A)</th>
                <th className="px-6 py-4 text-center">Candidate (B)</th>
                <th className="px-6 py-4">Delta</th>
                <th className="px-6 py-4 text-right">Verdict</th>
              </tr>
            </thead>
      <tbody className="divide-y divide-zinc-800">
        {fields.map((f) => {
          const valA = getMetric(runA.aggregates, f.key);
          const valB = getMetric(runB.aggregates, f.key);
          const delta = valB - valA;
          const isOverall = f.key === "overall";

          return (
            <tr key={f.key} className={`${isOverall ? "bg-white/[0.02]" : ""} group`}>
              <td className={`px-6 py-5 ${isOverall ? "font-bold text-white" : "text-zinc-300"}`}>{f.label}</td>
              <td className="px-6 py-5 text-center font-mono text-zinc-500">{(valA * 100).toFixed(1)}%</td>
              <td className="px-6 py-5 text-center font-mono text-zinc-200">{(valB * 100).toFixed(1)}%</td>
              <td className="px-6 py-5">
                <div className="flex flex-col gap-1.5 min-w-[120px]">
                  <div className="flex items-center gap-2">
                    {delta > 0 ? <TrendingUp className="h-4 w-4 text-emerald-500" /> : delta < 0 ? <TrendingDown className="h-4 w-4 text-red-500" /> : <Minus className="h-4 w-4 text-zinc-600" />}
                    <span className={`font-mono font-bold ${delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-zinc-600"}`}>
                      {delta > 0 ? "+" : ""}{(delta * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden flex">
                    <div 
                      className={`h-full ${delta > 0 ? "bg-emerald-500" : "bg-red-500"}`} 
                      style={{ 
                        width: `${Math.min(Math.abs(delta) * 200, 100)}%`,
                        marginLeft: delta > 0 ? "0" : "auto"
                      }} 
                    />
                  </div>
                </div>
              </td>
              <td className="px-6 py-5 text-right">
                {delta > 0.01 ? (
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded uppercase font-black tracking-widest border border-emerald-500/20">Strategy B Wins</span>
                ) : delta < -0.01 ? (
                  <span className="text-[10px] bg-red-500/10 text-red-400 px-2 py-1 rounded uppercase font-black tracking-widest border border-red-500/20">Strategy A Wins</span>
                ) : (
                  <span className="text-[10px] bg-zinc-800 text-zinc-600 px-2 py-1 rounded uppercase font-black tracking-widest border border-zinc-700">Draw</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Debug Section */}
      <div className="mt-20 border-t border-zinc-800 pt-10 pb-20">
        <details className="text-xs text-zinc-600">
          <summary className="cursor-pointer hover:text-zinc-400 uppercase tracking-widest font-bold">Debug Comparison Data</summary>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <pre className="p-4 bg-black rounded overflow-x-auto text-zinc-500">
              Run A Aggregates: {JSON.stringify(runA.aggregates, null, 2)}
            </pre>
            <pre className="p-4 bg-black rounded overflow-x-auto text-zinc-500">
              Run B Aggregates: {JSON.stringify(runB.aggregates, null, 2)}
            </pre>
          </div>
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

function BarChart3(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  );
}
