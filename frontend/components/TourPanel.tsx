"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, BookOpen, Boxes, ChevronDown, Compass, Download, FileText, Layers, RefreshCw, Sparkles } from "lucide-react";
import Markdown from "./Markdown";
import { ActionStream, SectionTitle, type Step } from "./ui";
import { api, type Tour } from "@/lib/api";

const LOADING_STEPS: Step[] = [
  { label: "Collect graph evidence", detail: "god nodes · Leiden communities · surprising cross-community edges · README", state: "done" },
  { label: "Gemma 4 reads the graph", detail: "names subsystems, picks start-here symbols, writes the reading path", state: "active" },
  { label: "Write names back to Graphify", detail: ".graphify_labels.json → re-render graph.html", state: "pending" },
];

export default function TourPanel({ repoId, onRelabelled }: { repoId: string; onRelabelled?: () => void }) {
  const [tour, setTour] = useState<Tour | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDoc, setShowDoc] = useState(false);

  async function load(refresh = false) {
    setLoading(true);
    setError(null);
    try {
      const t = await api.tour(repoId, refresh);
      setTour(t);
      if (t.graph_html_relabelled) onRelabelled?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoId]);

  if (loading && !tour) {
    return (
      <div className="glass p-6 rise">
        <div className="mb-5 flex items-center gap-2">
          <Sparkles size={16} className="text-accent-2" />
          <span className="font-medium">Generating the tour</span>
          <span className="pill pill-violet ml-auto">Gemma 4</span>
        </div>
        <ActionStream steps={LOADING_STEPS} />
      </div>
    );
  }
  if (error) return <div className="glass border-bad/40 p-5 text-sm text-bad">{error}</div>;
  if (!tour) return null;

  const fallback = tour.model.includes("fallback");

  return (
    <div className="space-y-3">
      {/* architecture */}
      <div className="glass relative overflow-hidden p-6 rise">
        <div className="absolute inset-y-0 left-0 w-1 grad-bg" />
        <div className="flex items-start justify-between gap-4">
          <SectionTitle icon={Compass}>Architecture</SectionTitle>
          <div className="flex items-center gap-2">
            <span className={`pill ${fallback ? "pill-warn" : "pill-violet"} mono`}>{tour.model}</span>
            <button className="btn-ghost !px-2.5 !py-1 text-xs" onClick={() => load(true)} disabled={loading} title="Regenerate with Gemma 4">
              <RefreshCw size={12} className={loading ? "spin" : ""} /> Regenerate
            </button>
          </div>
        </div>
        <p className="text-[15.5px] leading-[1.7] text-[#d5dce8]">{tour.architecture_summary}</p>
        {tour.parse_warning && <p className="mt-2 text-xs text-warn">{tour.parse_warning}</p>}
      </div>

      <div className="grid gap-3 xl:grid-cols-5">
        {/* start here */}
        <div className="glass p-5 rise rise-1 xl:col-span-3">
          <SectionTitle icon={BookOpen} right={<span className="pill">ordered for a first read</span>}>
            Start reading here
          </SectionTitle>
          <ol className="space-y-2">
            {tour.start_here?.map((s, i) => (
              <li key={i} className="inset flex gap-3 p-3 transition hover:border-line-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg grad-bg text-xs font-semibold text-white">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold">{s.node}</span>
                    <span className="mono text-[11px] text-accent">{s.file}</span>
                  </div>
                  <div className="mt-0.5 text-[13px] text-muted">{s.why}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* subsystems */}
        <div className="glass p-5 rise rise-2 xl:col-span-2">
          <SectionTitle icon={Layers}>Subsystems</SectionTitle>
          <p className="-mt-1 mb-3 text-xs text-muted">Leiden communities from Graphify, named by Gemma 4.</p>
          <ul className="space-y-2">
            {tour.subsystems?.slice(0, 12).map((s) => (
              <li key={s.community} className="text-[13px]">
                <div className="flex items-center gap-2">
                  <span className="mono rounded-md bg-violet/15 px-1.5 py-0.5 text-[10px] text-accent-2">C{s.community}</span>
                  <span className="font-medium">{s.label}</span>
                </div>
                <div className="ml-9 text-muted">{s.role}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {/* reading path */}
        <div className="glass p-5 rise rise-2">
          <SectionTitle icon={Boxes}>Reading path</SectionTitle>
          <ActionStream
            steps={(tour.reading_path || []).map((r) => ({
              label: r.file,
              detail: r.what_to_look_for,
              state: "done" as const,
            }))}
          />
        </div>

        {/* gotchas */}
        <div className="glass p-5 rise rise-3">
          <SectionTitle icon={AlertTriangle}>Gotchas</SectionTitle>
          <ul className="space-y-2">
            {(tour.gotchas || []).map((g, i) => (
              <li key={i} className="flex gap-2.5 rounded-lg border border-warn/25 bg-warn/[0.06] p-3 text-[13px] text-[#e7d9b3]">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
                <span>{g}</span>
              </li>
            ))}
            {!tour.gotchas?.length && <li className="text-sm text-muted">None flagged.</li>}
          </ul>
        </div>
      </div>

      {/* onboarding doc */}
      <div className="glass p-5 rise rise-4">
        <button className="flex w-full items-center justify-between" onClick={() => setShowDoc((v) => !v)}>
          <SectionTitle icon={FileText}>Generated ONBOARDING.md</SectionTitle>
          <span className="mb-3 flex items-center gap-2 text-sm text-muted">
            {showDoc ? "Hide" : "Show"} <ChevronDown size={14} className={`transition ${showDoc ? "rotate-180" : ""}`} />
          </span>
        </button>
        {showDoc && (
          <div className="inset p-5">
            <div className="mb-3 flex justify-end">
              <button
                className="btn-ghost !px-2.5 !py-1 text-xs"
                onClick={() => {
                  const blob = new Blob([tour.onboarding_md || ""], { type: "text/markdown" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = "ONBOARDING.md";
                  a.click();
                }}
              >
                <Download size={12} /> Download .md
              </button>
            </div>
            <Markdown>{tour.onboarding_md || ""}</Markdown>
          </div>
        )}
      </div>
    </div>
  );
}
