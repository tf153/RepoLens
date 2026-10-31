"use client";

import { useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { ActionStream, BigNumber, Inline, Section, type Step } from "./ui";
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
  const score = res?.drift_score ?? null;
  const tone = score === null ? undefined : score < 25 ? "ok" : score < 60 ? "warn" : "bad";

  return (
    <div className="space-y-14">
      <section className="grid gap-8 md:grid-cols-12">
        <div className="md:col-span-5">
          <div className="micro">04 / Diagram drift check</div>
          <p className="display display-md mt-3 !leading-[1.1]">Does the whiteboard still match the code?</p>
          <p className="mt-4 max-w-md text-[14.5px] leading-relaxed text-ink-2">
            Upload a whiteboard photo or architecture diagram. Gemma 4 vision reads the boxes and arrows; the Graphify
            graph is the ground truth it is checked against. You get what exists, what is missing, what is stale.
          </p>
          <div className="mt-6 flex gap-3">
            <button className="btn btn-ink" onClick={run} disabled={!file || busy}>
              {busy ? "Comparing" : "Check against code graph"} <ArrowRight size={15} />
            </button>
            {file && (
              <button className="btn btn-line" onClick={() => pick(null)} disabled={busy} title="Clear">
                <X size={14} />
              </button>
            )}
          </div>
          {error && <p className="mt-4 text-[14px] text-bad">{error}</p>}
        </div>

        <label
          className={`md:col-span-7 flex min-h-[320px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center transition ${
            drag ? "border-ink bg-paper-2" : "border-rule-2 hover:border-ink"
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
            <img src={preview} alt="diagram preview" className="max-h-[420px] rounded object-contain" />
          ) : (
            <>
              <div className="display num text-ink-4" style={{ fontSize: 72 }}>
                +
              </div>
              <div className="mt-2 text-[15px]">Drop an image here, or click to choose</div>
              <div className="micro mt-2">PNG · JPEG · WebP · up to 8 MB</div>
            </>
          )}
        </label>
      </section>

      {busy && (
        <section className="rise">
          <div className="micro pb-3">Comparing</div>
          <ActionStream steps={STEPS} />
        </section>
      )}

      {res?.error && (
        <section className="rise">
          <div className="rule-ink" />
          <p className="pt-4 text-[15px] text-warn">{res.error}</p>
        </section>
      )}

      {res && !res.error && (
        <>
          <section className="rise grid gap-8 md:grid-cols-12">
            <div className="md:col-span-4">
              <BigNumber value={score} label="drift score · 0 = diagram matches code" tone={tone} />
              <div className="mt-6 flex flex-wrap gap-2">
                <span className="tag tag-ok">{found} found</span>
                <span className="tag tag-bad">{total - found} not in code</span>
                {res.missing_in_diagram?.length > 0 && <span className="tag tag-warn">{res.missing_in_diagram.length} missing from diagram</span>}
              </div>
            </div>
            <div className="md:col-span-8">
              <div className="micro flex items-center justify-between pb-3">
                <span>Drift summary</span>
                <span className="mono normal-case tracking-normal">{res.model}</span>
              </div>
              <p className="text-[18px] font-light leading-snug tracking-tight"><Inline text={res.drift_summary} /></p>
            </div>
          </section>

          <Section index="05" title="Components in the diagram" className="rise rise-1">
            <ul>
              {res.components.map((c, i) => {
                const ok = c.found_in_graph || c.verified;
                return (
                  <li key={i} className="lrow grid-cols-[44px_1fr] md:grid-cols-[44px_minmax(0,1fr)_minmax(0,1.3fr)_90px]">
                    <span className="mono text-[11px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                    <div className="min-w-0">
                      <div className="text-[16px] font-medium">{c.name}</div>
                      {c.graph_node ? (
                        <div className="mono mt-0.5 truncate text-[11.5px] text-accent">
                          → {c.graph_node} <span className="text-ink-3">{c.graph_loc}</span>
                        </div>
                      ) : c.matched_node ? (
                        <div className="mono mt-0.5 truncate text-[11.5px] text-ink-3">→ {c.matched_node}</div>
                      ) : null}
                    </div>
                    <div className="text-[13.5px] text-ink-2"><Inline text={c.note || ""} /></div>
                    <span className={`micro md:justify-self-end ${ok ? "!text-ok" : "!text-bad"}`}>
                      {ok ? (c.verified ? "verified" : "found") : "not in code"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Section>

          {res.missing_in_diagram?.length > 0 && (
            <Section index="06" title="In the code, missing from the diagram" className="rise rise-2">
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {res.missing_in_diagram.map((m, i) => (
                  <span key={i} className="mono text-[14px]">
                    <span className="text-accent">+</span> {m}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {res.relationships && res.relationships.length > 0 && (
            <Section index="07" title="Arrows" className="rise rise-3">
              <ul className="mono text-[12.5px]">
                {res.relationships.map((r, i) => (
                  <li key={i} className="row grid grid-cols-[70px_1fr] gap-4 py-2">
                    <span className={`micro ${r.supported_by_graph === true ? "!text-ok" : r.supported_by_graph === false ? "!text-bad" : ""}`}>
                      {r.supported_by_graph === true ? "holds" : r.supported_by_graph === false ? "false" : "unknown"}
                    </span>
                    <span>
                      {r.from} <span className="text-ink-3">→</span> {r.to} {r.label && <span className="text-ink-3">({r.label})</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
