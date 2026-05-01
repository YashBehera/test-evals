"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { ExtractionRun } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@test-evals/ui/components/card";
import { Button } from "@test-evals/ui/components/button";
import { ChevronLeft, RotateCcw, Cpu, Clock, Zap, FileText } from "lucide-react";
import Link from "next/link";

export default function ExtractionDetailPage() {
  const params = useParams();
  const runId = Number(params.id);
  
  const [run, setRun] = useState<ExtractionRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await apiFetch<{ run: ExtractionRun }>(`/api/v1/extract/runs/${runId}`);
        setRun(data.run);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load extraction details");
      } finally {
        setLoading(false);
      }
    }
    if (runId) load();
  }, [runId]);

  if (loading) return <div className="p-8 text-center text-white">Loading extraction details...</div>;
  if (error || !run) return <div className="p-8 text-center text-red-500">{error || "Extraction not found"}</div>;

  return (
    <div className="container mx-auto p-6 max-w-7xl animate-in fade-in duration-500">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/dashboard" className="inline-flex items-center text-sm text-zinc-400 hover:text-white transition-colors">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back to Dashboard
        </Link>
        <div className="h-4 w-px bg-zinc-800" />
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => window.location.reload()}
          className="text-zinc-400 hover:text-white"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="mb-10">
        <h1 className="text-4xl font-black text-white mb-4">Extraction Run #{run.id}</h1>
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-blue-400 font-medium border border-blue-500/20">
            <Zap className="h-4 w-4" />
            Strategy: {run.strategy}
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1 text-zinc-300 font-medium border border-zinc-700">
            <Cpu className="h-4 w-4" />
            Model: {run.model}
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1 text-zinc-300 font-medium border border-zinc-700">
            <Clock className="h-4 w-4" />
            Duration: {((run.durationMs || 0) / 1000).toFixed(2)}s
          </span>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-zinc-400 text-sm uppercase tracking-widest font-bold">
              <FileText className="h-4 w-4 text-indigo-400" />
              Source Transcript
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[600px] overflow-y-auto rounded-lg bg-black/40 p-6 text-zinc-300 text-sm leading-relaxed font-mono border border-zinc-800/50">
              <pre className="whitespace-pre-wrap">{run.transcript || "No transcript available"}</pre>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-zinc-400 text-sm uppercase tracking-widest font-bold">
              <Zap className="h-4 w-4 text-emerald-400" />
              Extraction Output (JSON)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[600px] overflow-y-auto rounded-lg bg-black/40 p-6 border border-zinc-800/50">
              <pre className="text-emerald-400/90 text-sm font-mono leading-relaxed">
                {JSON.stringify(run.output, null, 2)}
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardContent className="pt-6">
            <div className="text-zinc-500 text-xs font-bold uppercase tracking-wider mb-1">Input Tokens</div>
            <div className="text-2xl font-mono text-white">{(run as any).inputTokens?.toLocaleString() ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardContent className="pt-6">
            <div className="text-zinc-500 text-xs font-bold uppercase tracking-wider mb-1">Output Tokens</div>
            <div className="text-2xl font-mono text-white">{(run as any).outputTokens?.toLocaleString() ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardContent className="pt-6">
            <div className="text-zinc-500 text-xs font-bold uppercase tracking-wider mb-1">Total Attempts</div>
            <div className="text-2xl font-mono text-white">{run.attempts}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
