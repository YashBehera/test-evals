"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { EvaluationRun, EvaluationCase } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@test-evals/ui/components/card";
import { Button } from "@test-evals/ui/components/button";
import { ChevronLeft, Terminal, FileJson, FileText, Check, X, Info } from "lucide-react";
import Link from "next/link";

export default function CaseDetailPage() {
  const params = useParams();
  const runId = Number(params.id);
  const caseId = params.caseId as string;

  const [run, setRun] = useState<EvaluationRun | null>(null);
  const [caseData, setCaseData] = useState<EvaluationCase | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [gold, setGold] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"transcript" | "diff" | "trace">("transcript");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await apiFetch<EvaluationRun & { cases: EvaluationCase[] }>(`/api/v1/evaluate/runs/${runId}`);
        setRun(data);
        const c = data.cases.find(x => x.caseId === caseId);
        if (!c) throw new Error("Case not found in run");
        setCaseData(c);

        // Fetch transcript
        try {
          const transcriptData = await apiFetch<{ transcript: string }>(`/api/v1/cases/${caseId}/transcript`);
          setTranscript(transcriptData.transcript);
        } catch (e) { console.error("Transcript load failed", e); }

        // Fetch gold JSON
        try {
          const goldData = await apiFetch<{ gold: any }>(`/api/v1/cases/${caseId}/gold`);
          setGold(goldData.gold);
        } catch (e) { console.error("Gold load failed", e); }

      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load case details");
      } finally {
        setLoading(false);
      }
    }
    if (runId && caseId) load();
  }, [runId, caseId]);

  if (loading) return <div className="p-8 text-center text-white">Loading case inspection...</div>;
  if (error || !caseData) return <div className="p-8 text-center text-red-500">{error || "Case not found"}</div>;

  return (
    <div className="container mx-auto p-6 max-w-7xl animate-in fade-in duration-500">
      <Link href={`/dashboard/eval/${runId}`} className="mb-6 inline-flex items-center text-sm text-zinc-400 hover:text-white transition-colors">
        <ChevronLeft className="mr-1 h-4 w-4" />
        Back to Run #{runId}
      </Link>

      <div className="mb-8 flex items-end justify-between border-b border-zinc-800 pb-6">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tighter uppercase">{caseId}</h1>
          <div className="flex gap-4 mt-2">
            <Badge label="Score" value={`${(caseData.overall * 100).toFixed(1)}%`} color={caseData.overall > 0.8 ? "emerald" : "amber"} />
            <Badge label="Model" value={run?.model || "..."} color="zinc" />
          </div>
        </div>
        <div className="flex bg-zinc-900 rounded-xl p-1.5 border border-zinc-800 shadow-inner">
          <TabButton active={activeTab === "transcript"} onClick={() => setActiveTab("transcript")} icon={<FileText className="h-4 w-4" />} label="Transcript" />
          <TabButton active={activeTab === "diff"} onClick={() => setActiveTab("diff")} icon={<FileJson className="h-4 w-4" />} label="JSON Diff" />
          <TabButton active={activeTab === "trace"} onClick={() => setActiveTab("trace")} icon={<Terminal className="h-4 w-4" />} label="LLM Trace" />
        </div>
      </div>

      <div className="grid gap-6">
        {activeTab === "transcript" && <TranscriptView text={transcript} prediction={caseData.prediction} />}
        {activeTab === "diff" && <JsonDiffView gold={gold} predicted={caseData.prediction} />}
        {activeTab === "trace" && <TraceView attempts={caseData.attempts || []} usage={caseData.usage} />}
      </div>
    </div>
  );
}

function Badge({ label, value, color }: { label: string; value: string; color: string }) {
  const colors: any = {
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    zinc: "bg-zinc-800 text-zinc-400 border-zinc-700",
  };
  return (
    <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${colors[color]}`}>
      <span className="opacity-50 uppercase tracking-tighter text-[10px]">{label}:</span>
      <span>{value}</span>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
        active ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function TranscriptView({ text, prediction }: { text: string; prediction: any }) {
  const valuesToHighlight = new Set<string>();
  
  const extractStrings = (obj: any) => {
    if (typeof obj === "string" && obj.length > 3) valuesToHighlight.add(obj);
    else if (Array.isArray(obj)) obj.forEach(extractStrings);
    else if (obj && typeof obj === "object") Object.values(obj).forEach(extractStrings);
  };
  extractStrings(prediction);

  let highlighted = text;
  if (text) {
    Array.from(valuesToHighlight).sort((a, b) => b.length - a.length).forEach(val => {
      const escaped = val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(${escaped})`, "gi");
      highlighted = highlighted.replace(regex, '<mark class="bg-indigo-500/30 text-indigo-200 rounded px-0.5 border-b-2 border-indigo-500/50">$1</mark>');
    });
  }

  return (
    <Card className="border-zinc-800 bg-zinc-900/50 overflow-hidden">
      <CardContent className="p-0">
        <div 
          className="whitespace-pre-wrap font-sans text-zinc-300 leading-relaxed bg-zinc-950 p-8 text-lg selection:bg-indigo-500/50 min-h-[400px]"
          dangerouslySetInnerHTML={{ __html: highlighted || text || "No transcript available." }}
        />
      </CardContent>
    </Card>
  );
}

function JsonDiffView({ gold, predicted }: { gold: any; predicted: any }) {
  const diffs = compareObjects(gold, predicted);

  return (
    <Card className="border-zinc-800 bg-zinc-950 overflow-hidden">
      <CardHeader className="border-b border-zinc-800 bg-zinc-900/50">
        <CardTitle className="text-sm font-bold text-zinc-400">Field-Level Comparison</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-zinc-800/50">
          {diffs.map((d, i) => (
            <div key={i} className={`flex items-start gap-4 px-6 py-4 ${d.type === "match" ? "bg-emerald-500/[0.02]" : d.type === "mismatch" ? "bg-red-500/[0.02]" : "bg-amber-500/[0.02]"}`}>
              <div className="w-1/4 pt-1">
                 <code className="text-xs font-bold text-zinc-500 uppercase tracking-tight">{d.path}</code>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-8">
                 <div className="space-y-1">
                    <p className="text-[10px] uppercase font-bold text-zinc-600">Gold</p>
                    <div className="text-sm text-zinc-300 font-mono break-all">{JSON.stringify(d.gold, null, 2)}</div>
                 </div>
                 <div className="space-y-1">
                    <p className="text-[10px] uppercase font-bold text-zinc-600">Predicted</p>
                    <div className={`text-sm font-mono break-all ${d.type === "match" ? "text-emerald-400" : d.type === "mismatch" ? "text-red-400" : "text-amber-400"}`}>
                      {JSON.stringify(d.predicted, null, 2)}
                    </div>
                 </div>
              </div>
              <div className="w-24 text-right pt-1">
                 {d.type === "match" ? (
                   <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Match</span>
                 ) : d.type === "mismatch" ? (
                   <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Mismatch</span>
                 ) : (
                   <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Extra</span>
                 )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function compareObjects(gold: any, pred: any, path = ""): any[] {
  const results: any[] = [];
  
  if (!gold || typeof gold !== "object") {
    if (JSON.stringify(gold) === JSON.stringify(pred)) {
      return [{ path, gold, predicted: pred, type: "match" }];
    } else {
      return [{ path, gold, predicted: pred, type: "mismatch" }];
    }
  }

  const keys = new Set([...Object.keys(gold), ...Object.keys(pred || {})]);
  
  for (const key of keys) {
    const currentPath = path ? `${path}.${key}` : key;
    const goldVal = gold[key];
    const predVal = pred?.[key];

    if (!(key in (pred || {}))) {
      results.push({ path: currentPath, gold: goldVal, predicted: undefined, type: "mismatch" });
    } else if (typeof goldVal === "object" && goldVal !== null && !Array.isArray(goldVal)) {
      results.push(...compareObjects(goldVal, predVal, currentPath));
    } else {
      const match = JSON.stringify(goldVal) === JSON.stringify(predVal);
      results.push({ path: currentPath, gold: goldVal, predicted: predVal, type: match ? "match" : "mismatch" });
    }
  }

  return results;
}

function TraceView({ attempts, usage }: { attempts: any[]; usage: any }) {
  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-4">
        <TraceStat label="Input Tokens" value={usage?.inputTokens || 0} />
        <TraceStat label="Output Tokens" value={usage?.outputTokens || 0} />
        <TraceStat label="Cache Hits" value={usage?.cacheReadInputTokens || 0} />
        <TraceStat label="Attempts" value={attempts?.length || 1} />
      </div>

      <div className="space-y-6">
        {(attempts || []).map((a, i) => (
          <div key={i} className="relative pl-8 border-l-2 border-zinc-800 ml-4 pb-8 last:pb-0">
             <div className="absolute -left-2.5 top-0 h-4 w-4 rounded-full bg-zinc-800 border-2 border-zinc-950" />
             <div className="mb-4 flex items-center gap-3">
                <span className="text-xs font-black uppercase tracking-tighter text-zinc-400 bg-zinc-800 px-2 py-1 rounded">Attempt #{i+1}</span>
                <div className="flex gap-4 text-[10px] font-mono text-zinc-500">
                  <span>In: {a.usage?.input_tokens || 0}</span>
                  <span>Out: {a.usage?.output_tokens || 0}</span>
                  {a.usage?.cache_read_input_tokens > 0 && <span className="text-emerald-500">Cache: {a.usage.cache_read_input_tokens}</span>}
                </div>
                <span className="h-px flex-1 bg-zinc-800/50" />
             </div>
             
             <div className="grid gap-4 md:grid-cols-1">
                <div className="space-y-2">
                  <p className="text-[10px] uppercase font-bold text-zinc-500">Raw Tool Call / Output</p>
                  <div className="bg-zinc-950 p-6 rounded-xl border border-zinc-800 text-[12px] font-mono text-zinc-400 overflow-auto max-h-[500px]">
                    <pre>{JSON.stringify(a.toolInput || a.rawContent, null, 2)}</pre>
                  </div>
                </div>
                
                {a.validationErrors?.length > 0 && (
                  <div className="mt-4 p-4 rounded-xl bg-red-500/5 border border-red-500/20">
                    <p className="text-[10px] uppercase font-bold text-red-500 mb-2">Validation Errors</p>
                    <ul className="list-disc list-inside text-xs text-red-400 space-y-1">
                      {a.validationErrors.map((err: string, j: number) => (
                        <li key={j}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
             </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TraceStat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="border-zinc-800 bg-zinc-900/50 py-4 text-center">
      <p className="text-xs text-zinc-500 uppercase tracking-tighter font-bold">{label}</p>
      <p className="text-xl font-mono text-white mt-1">{value?.toLocaleString() || 0}</p>
    </Card>
  );
}
