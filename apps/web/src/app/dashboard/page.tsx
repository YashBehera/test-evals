"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api";

import { EvaluationRunsTable } from "@/components/EvaluationRunsTable";
import { ExtractionRunsTable } from "@/components/ExtractionRunsTable";

const STRATEGIES = ["zero_shot", "few_shot", "cot"];
const MODELS = [
  "claude-3-haiku-20240307", 
  "claude-3-5-sonnet-20240620", 
  "claude-haiku-4-5-20251001"
];
const CASES = Array.from({ length: 50 }, (_, i) => `case_${String(i + 1).padStart(3, '0')}`);

type Session = typeof authClient.$Infer.Session;

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [strategy, setStrategy] = useState("zero_shot");
  const [model, setModel] = useState("claude-haiku-4-5-20251001");
  const [caseId, setCaseId] = useState("case_001");
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      try {
        const result = await authClient.getSession({
          fetchOptions: {
            credentials: "include",
            throw: false,
          },
        });

        if (!isMounted) return;

        if (result.error) {
          setError(result.error.message ?? "Failed to load session");
          return;
        }
        if (!result.data?.user) {
          router.replace("/login");
          return;
        }

        setSession(result.data);
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load session");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadSession();
    return () => { isMounted = false; };
  }, [router]);

  const startNewRun = async () => {
    try {
      setIsStarting(true);
      const { runId } = await apiFetch<{ runId: number }>("/api/v1/runs", {
        method: "POST",
        body: JSON.stringify({ strategy, model })
      });
      window.location.href = `/dashboard/eval/${runId}`;
    } catch (err) {
      console.error("Failed to start run", err);
      alert("Failed to start run");
    } finally {
      setIsStarting(false);
    }
  };

  const startExtraction = async () => {
    try {
      setIsStarting(true);
      const { transcript } = await apiFetch<{ transcript: string }>(`/api/v1/cases/${caseId}/transcript`);
      const result = await apiFetch<{ runId: number }>("/api/v1/extract", {
        method: "POST",
        body: JSON.stringify({ transcript, strategy, model })
      });
      window.location.href = `/dashboard/extract/${result.runId}`;
    } catch (err) {
      console.error("Failed to start extraction", err);
      alert("Failed to start extraction");
    } finally {
      setIsStarting(false);
    }
  };

  if (loading) return <p className="p-8 text-center text-zinc-500">Loading dashboard...</p>;
  if (error) return <p className="p-8 text-center text-red-500">{error}</p>;
  if (!session?.user) return null;

  return (
    <div className="container mx-auto p-6 max-w-7xl animate-in fade-in duration-700">
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between border-b border-zinc-800 pb-8 gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-white mb-2">Evaluation Runner</h1>
          <p className="text-zinc-500 font-medium">Monitor, compare and optimize clinical extraction strategies.</p>
        </div>
        
        <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800 flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 ml-1">Strategy</label>
            <select 
              value={strategy} 
              onChange={(e) => setStrategy(e.target.value)}
              className="bg-zinc-800 text-white text-sm px-3 py-2 rounded-lg border border-zinc-700 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              {STRATEGIES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 ml-1">Model</label>
            <select 
              value={model} 
              onChange={(e) => setModel(e.target.value)}
              className="bg-zinc-800 text-white text-sm px-3 py-2 rounded-lg border border-zinc-700 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 ml-1">Case ID</label>
            <select 
              value={caseId} 
              onChange={(e) => setCaseId(e.target.value)}
              className="bg-zinc-800 text-white text-sm px-3 py-2 rounded-lg border border-zinc-700 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              {CASES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="flex gap-2">
            <button 
              onClick={startExtraction}
              disabled={isStarting}
              className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-bold transition-all border border-zinc-700 active:scale-95 flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> Extract
            </button>
            <button 
              onClick={startNewRun}
              disabled={isStarting}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-bold transition-all shadow-lg shadow-indigo-500/20 active:scale-95 flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> Evaluate All
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-12">
        <EvaluationRunsTable />
        <ExtractionRunsTable />
      </div>
    </div>
  );
}
