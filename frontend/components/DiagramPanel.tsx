"use client";

import { useState } from "react";
import { AlertTriangle, Check, Eye, Image as ImageIcon, ScanSearch, Upload, X } from "lucide-react";
import { ActionStream, Gauge, SectionTitle, type Step } from "./ui";
import { api, type DiagramResult } from "@/lib/api";

const STEPS: Step[] = [
  { label: "Gemma 4 vision reads boxes and arrows", state: "active" },
  { label: "Match components to god nodes, communities, directories", state: "pending" },
  { label: "Graph verifies each match deterministically", state: "pending" },
  { label: "Score the drift", state: "pending" },
];

export default function DiagramPanel({ repoId }: { repoId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [res, setRes] = useState<DiagramResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

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

  const found = res?.components.filter((c) => c.found_in_graph || c.verified).length ?? 0;
  const total = res?.components.length ?? 0;

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* input */}
      <div className="space-y-3">
        <div className="glass p-5 rise">
          <SectionTitle icon={ScanSearch}>Diagram drift check</SectionTitle>
          <p className="-mt-1 text-[13.5px] leading-relaxed text-muted">
            Upload a whiteboard photo or architecture diagram. <b className="text-fg">Gemma 4 vision</b> reads the boxes and
            arrows; the <b className="text-fg">Graphify graph</b> is the ground truth it is checked against. You get what
            exists, what is missing, what is stale.
          </p>

          <label
            className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center transition ${
              drag ? "border-accent bg-accent/5 ring-accent" : "border-line-2 bg-black/20 hover:border-accent/60"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              pick(e.dataTransfer.files?.[0] || null);
            }}
          >
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => pick(e.target.files?.[0] || null)} />
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="diagram preview" className="max-h-80 rounded-lg object-contain shadow-2xl" />
            ) : (
              <>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet/15 text-accent-2">
                  <Upload size={18} />
                </span>
                <div className="mt-3 text-sm font-medium">Drop an image here, or click to choose</div>
                <div className="mt-1 text-xs text-muted">PNG · JPEG · WebP · up to 8 MB · whiteboard photos welcome</div>
              </>
            )}
          </label>

          <div className="mt-4 flex gap-2">
            <button className="btn-primary flex-1" onClick={run} disabled={!file || busy}>
              <Eye size={15} /> {busy ? "Comparing with the graph…" : "Check against code graph"}
            </button>
            {file && (
              <button className="btn-ghost" onClick={() => pick(null)} disabled={busy} title="Clear">
                <X size={15} />
              </button>
            )}
          </div>
          {error && <div className="mt-3 rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad">{error}</div>}
        </div>

        {busy && (
          <div className="glass p-5 rise">
            <ActionStream steps={STEPS} />
          </div>
        )}
      </div>

      {/* results */}
      <div className="space-y-3">
        {!res && !busy && (
          <div className="glass flex h-full min-h-[260px] flex-col items-center justify-center p-8 text-center rise rise-1">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-muted">
              <ImageIcon size={20} />
            </span>
            <div className="mt-4 font-medium">Results appear here</div>
            <p className="mt-1 max-w-sm text-sm text-muted">
              Each component is marked <span className="text-ok">found</span> or <span className="text-bad">not in code</span>, you
              see the god nodes your diagram forgot, and a drift score from 0 (perfect) to 100.
            </p>
          </div>
        )}

        {res?.error && (
          <div className="glass border-warn/40 p-5 text-sm rise">
            <div className="flex items-center gap-2 font-medium text-warn">
              <AlertTriangle size={15} /> Gemma 4 vision unavailable
            </div>
            <p className="mt-1 text-muted">{res.error}</p>
          </div>
        )}

        {res && !res.error && (
          <>
            <div className="glass flex flex-col gap-5 p-5 sm:flex-row rise">
              <Gauge value={res.drift_score ?? null} label="drift score" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">Drift summary</div>
                  <span className="pill pill-violet mono">{res.model}</span>
                </div>
                <p className="mt-2 text-[13.5px] leading-relaxed text-[#d5dce8]">{res.drift_summary}</p>
                <div className="mt-3 flex gap-2">
                  <span className="pill pill-ok">
                    <Check size={11} /> {found} found
                  </span>
                  <span className="pill pill-bad">
                    <X size={11} /> {total - found} not in code
                  </span>
                  {res.missing_in_diagram?.length > 0 && (
                    <span className="pill pill-warn">
                      <AlertTriangle size={11} /> {res.missing_in_diagram.length} missing from diagram
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="glass p-5 rise rise-1">
              <SectionTitle icon={ScanSearch}>Components in the diagram</SectionTitle>
              <ul className="space-y-1.5">
                {res.components.map((c, i) => {
                  const ok = c.found_in_graph || c.verified;
                  return (
                    <li key={i} className="inset flex items-start gap-3 p-3 text-[13px]">
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${ok ? "bg-ok/15 text-ok" : "bg-bad/15 text-bad"}`}>
                        {ok ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-medium">{c.name}</span>
                          {c.graph_node ? (
                            <span className="mono text-[11px] text-accent">
                              → {c.graph_node} <span className="text-muted-2">{c.graph_loc}</span>
                            </span>
                          ) : c.matched_node ? (
                            <span className="mono text-[11px] text-muted">→ {c.matched_node}</span>
                          ) : null}
                          {c.verified && <span className="pill pill-ok !py-0 text-[10px]">graph-verified</span>}
                        </div>
                        {c.note && <div className="mt-0.5 text-muted">{c.note}</div>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {res.missing_in_diagram?.length > 0 && (
              <div className="glass p-5 rise rise-2">
                <SectionTitle icon={AlertTriangle}>In the code, missing from the diagram</SectionTitle>
                <div className="flex flex-wrap gap-2">
                  {res.missing_in_diagram.map((m, i) => (
                    <span key={i} className="pill pill-warn mono">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {res.relationships && res.relationships.length > 0 && (
              <div className="glass p-5 rise rise-3">
                <SectionTitle>Arrows</SectionTitle>
                <ul className="mono space-y-1.5 text-xs">
                  {res.relationships.map((r, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                          r.supported_by_graph === true
                            ? "bg-ok/15 text-ok"
                            : r.supported_by_graph === false
                              ? "bg-bad/15 text-bad"
                              : "bg-white/5 text-muted"
                        }`}
                      >
                        {r.supported_by_graph === true ? "✓" : r.supported_by_graph === false ? "✗" : "?"}
                      </span>
                      <span className="text-fg">{r.from}</span>
                      <span className="text-muted-2">→</span>
                      <span className="text-fg">{r.to}</span>
                      {r.label && <span className="text-muted-2">({r.label})</span>}
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
