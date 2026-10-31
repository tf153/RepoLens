"use client";

import { useEffect, useState } from "react";
import Markdown from "./Markdown";
import { api, type Tour } from "@/lib/api";

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
      <div className="card p-6">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 animate-pulse rounded-full bg-accent-2" />
          <div>
            <div className="font-medium">Gemma 4 is reading the graph…</div>
            <div className="text-sm text-muted">God nodes, communities and surprising edges → guided tour (10–30 s)</div>
          </div>
        </div>
      </div>
    );
  }
  if (error) return <div className="card border-bad/50 p-4 text-sm text-bad">{error}</div>;
  if (!tour) return null;

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">Architecture</h2>
          <div className="flex items-center gap-2">
            <span className="pill mono">{tour.model}</span>
            <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => load(true)} disabled={loading}>
              {loading ? "…" : "Regenerate"}
            </button>
          </div>
        </div>
        <p className="mt-2 leading-relaxed text-[15px]">{tour.architecture_summary}</p>
        {tour.parse_warning && <p className="mt-2 text-xs text-warn">{tour.parse_warning}</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="font-semibold text-accent">Start reading here</h3>
          <ol className="mt-3 space-y-3">
            {tour.start_here?.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-panel-2 text-xs text-accent">
                  {i + 1}
                </span>
                <div>
                  <div className="font-medium">
                    {s.node} <span className="mono text-xs text-muted">{s.file}</span>
                  </div>
                  <div className="text-sm text-muted">{s.why}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-accent">Subsystems (Leiden communities, named by Gemma 4)</h3>
          <ul className="mt-3 space-y-2">
            {tour.subsystems?.slice(0, 12).map((s) => (
              <li key={s.community} className="text-sm">
                <span className="pill mono mr-2">C{s.community}</span>
                <span className="font-medium">{s.label}</span>
                <span className="text-muted"> — {s.role}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="font-semibold text-accent">Reading path</h3>
          <ol className="mt-3 space-y-2 text-sm">
            {tour.reading_path?.map((r) => (
              <li key={r.step} className="flex gap-2">
                <span className="mono text-muted">{r.step}.</span>
                <div>
                  <span className="mono text-accent-2">{r.file}</span>
                  <div className="text-muted">{r.what_to_look_for}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="card p-5">
          <h3 className="font-semibold text-warn">Gotchas</h3>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
            {(tour.gotchas || []).map((g, i) => (
              <li key={i}>{g}</li>
            ))}
            {!tour.gotchas?.length && <li>None flagged.</li>}
          </ul>
        </div>
      </div>

      <div className="card p-5">
        <button className="flex w-full items-center justify-between" onClick={() => setShowDoc((v) => !v)}>
          <h3 className="font-semibold">Generated onboarding doc (ONBOARDING.md)</h3>
          <span className="text-sm text-muted">{showDoc ? "Hide" : "Show"}</span>
        </button>
        {showDoc && (
          <div className="mt-3">
            <div className="mb-2 flex justify-end">
              <button
                className="btn-ghost !px-2 !py-1 text-xs"
                onClick={() => {
                  const blob = new Blob([tour.onboarding_md || ""], { type: "text/markdown" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = "ONBOARDING.md";
                  a.click();
                }}
              >
                Download .md
              </button>
            </div>
            <Markdown>{tour.onboarding_md || ""}</Markdown>
          </div>
        )}
      </div>
    </div>
  );
}
