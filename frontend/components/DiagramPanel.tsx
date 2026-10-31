"use client";

import { useState } from "react";
import { api, type DiagramResult } from "@/lib/api";

export default function DiagramPanel({ repoId }: { repoId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [res, setRes] = useState<DiagramResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick(f: File | null) {
    setFile(f);
    setRes(null);
    setError(null);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function run() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setRes(await api.diagram(repoId, file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const score = res?.drift_score ?? null;
  const scoreColor = score === null ? "text-muted" : score < 25 ? "text-ok" : score < 60 ? "text-warn" : "text-bad";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="card p-5">
        <h3 className="font-semibold">Diagram drift check</h3>
        <p className="mt-1 text-sm text-muted">
          Upload a whiteboard photo or architecture diagram. Gemma 4 (vision) reads the boxes and arrows, then
          reconciles them against the real Graphify graph: what exists, what is missing, what is stale.
        </p>
        <label
          className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-panel-2/50 p-6 text-center hover:border-accent"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pick(e.dataTransfer.files?.[0] || null);
          }}
        >
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0] || null)}
          />
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="diagram preview" className="max-h-72 rounded-lg object-contain" />
          ) : (
            <>
              <div className="text-sm">Drop an image here or click to choose</div>
              <div className="mt-1 text-xs text-muted">PNG / JPEG / WebP, up to 8 MB</div>
            </>
          )}
        </label>
        <div className="mt-4 flex gap-2">
          <button className="btn-primary" onClick={run} disabled={!file || busy}>
            {busy ? "Gemma 4 is comparing…" : "Check against code graph"}
          </button>
          {file && (
            <button className="btn-ghost" onClick={() => pick(null)} disabled={busy}>
              Clear
            </button>
          )}
        </div>
        {error && <div className="mt-3 text-sm text-bad">{error}</div>}
      </div>

      <div className="space-y-4">
        {!res && (
          <div className="card p-5 text-sm text-muted">
            Results appear here: each component is marked{" "}
            <span className="text-ok">found</span> / <span className="text-bad">not in code</span>, plus the god nodes
            your diagram forgot and a drift score.
          </div>
        )}
        {res?.error && <div className="card border-bad/50 p-4 text-sm text-bad">{res.error}</div>}
        {res && !res.error && (
          <>
            <div className="card p-5">
              <div className="flex items-start justify-between gap-4">
                <h3 className="font-semibold">Drift summary</h3>
                <div className="text-right">
                  <div className={`text-3xl font-semibold ${scoreColor}`}>{score ?? "—"}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted">drift score (0 = perfect)</div>
                </div>
              </div>
              <p className="mt-2 text-sm leading-relaxed">{res.drift_summary}</p>
              <div className="mt-2 text-xs text-muted">
                model <span className="mono">{res.model}</span>
              </div>
            </div>

            <div className="card p-5">
              <h3 className="font-semibold">Components in the diagram</h3>
              <ul className="mt-3 space-y-2">
                {res.components.map((c, i) => {
                  const ok = c.found_in_graph || c.verified;
                  return (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${ok ? "bg-ok" : "bg-bad"}`} />
                      <div>
                        <div className="font-medium">
                          {c.name}
                          {c.graph_node && (
                            <span className="mono ml-2 text-xs text-accent-2">
                              → {c.graph_node} <span className="text-muted">{c.graph_loc}</span>
                            </span>
                          )}
                          {!c.graph_node && c.matched_node && (
                            <span className="mono ml-2 text-xs text-muted">→ {c.matched_node}</span>
                          )}
                        </div>
                        {c.note && <div className="text-muted">{c.note}</div>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {res.missing_in_diagram?.length > 0 && (
              <div className="card p-5">
                <h3 className="font-semibold text-warn">In the code, missing from the diagram</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {res.missing_in_diagram.map((m, i) => (
                    <span key={i} className="pill mono text-warn">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {res.relationships && res.relationships.length > 0 && (
              <div className="card p-5">
                <h3 className="font-semibold">Arrows</h3>
                <ul className="mono mt-2 space-y-1 text-xs">
                  {res.relationships.map((r, i) => (
                    <li key={i}>
                      <span
                        className={
                          r.supported_by_graph === true ? "text-ok" : r.supported_by_graph === false ? "text-bad" : "text-muted"
                        }
                      >
                        {r.supported_by_graph === true ? "✓" : r.supported_by_graph === false ? "✗" : "?"}
                      </span>{" "}
                      {r.from} → {r.to} {r.label ? <span className="text-muted">({r.label})</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
