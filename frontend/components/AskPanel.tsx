"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight } from "lucide-react";
import Markdown from "./Markdown";
import { ActionStream, Prov, type Step } from "./ui";
import { api, type ChatResult, type EdgeRow } from "@/lib/api";

interface Turn {
  q: string;
  r?: ChatResult;
  error?: string;
}

function thinkingSteps(elapsedMs: number): Step[] {
  const stage = elapsedMs < 400 ? 0 : elapsedMs < 1200 ? 1 : elapsedMs < 2200 ? 2 : 3;
  const st = (i: number): Step["state"] => (i < stage ? "done" : i === stage ? "active" : "pending");
  return [
    { label: "Resolve question terms to graph symbols", state: st(0) },
    { label: "Traverse the 2-hop neighbourhood", state: st(1) },
    { label: "Compute shortest paths between seeds", state: st(2) },
    { label: "Gemma 4 composes the answer from evidence only", state: st(3) },
  ];
}

function Thinking() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setT(Date.now() - start), 200);
    return () => clearInterval(id);
  }, []);
  return <ActionStream compact steps={thinkingSteps(t)} />;
}

function Chain({ path }: { path: EdgeRow[] }) {
  if (!path.length) return null;
  return (
    <div className="mono flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
      <span className="text-ink" title={path[0].source_loc}>
        {path[0].source}
      </span>
      {path.map((e, i) => (
        <span key={i} className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-ink-3">
            <Prov confidence={e.confidence} label={false} />
            {e.relation}
            <ArrowRight size={11} />
          </span>
          <span className="text-ink" title={e.target_loc}>
            {e.target}
          </span>
        </span>
      ))}
    </div>
  );
}

export default function AskPanel({ repoId, suggestions }: { repoId: string; suggestions: string[] }) {
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (turns.length) bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setBusy(true);
    setQ("");
    const idx = turns.length;
    setTurns((t) => [...t, { q: question }]);
    try {
      const r = await api.chat(repoId, question);
      setTurns((t) => t.map((x, i) => (i === idx ? { ...x, r } : x)));
    } catch (e) {
      setTurns((t) => t.map((x, i) => (i === idx ? { ...x, error: (e as Error).message } : x)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100vh - 240px)" }}>
      <div className="flex items-baseline justify-between pb-4">
        <span className="micro">03 / Ask the graph</span>
        <span className="micro flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="dot dot-filled" /> extracted
          </span>
          <span className="flex items-center gap-1.5">
            <span className="dot" /> inferred
          </span>
        </span>
      </div>

      {/* composer — editorial field */}
      <form
        className="grid items-end gap-4 md:grid-cols-12"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <div className="md:col-span-10">
          <input
            className="field display !text-[clamp(22px,2.4vw,34px)] !font-light"
            placeholder="How does auth reach the database?"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="flex md:col-span-2 md:justify-end">
          <button className="btn btn-ink w-full md:w-auto" disabled={busy || !q.trim()}>
            {busy ? "Tracing" : "Ask"} <ArrowRight size={15} />
          </button>
        </div>
      </form>

      {turns.length === 0 && (
        <div className="rise mt-10">
          <div className="micro pb-2">Suggested</div>
          <ul>
            {suggestions.map((s) => (
              <li key={s}>
                <button className="lrow lrow-hover w-full grid-cols-[1fr_24px] px-1 text-left text-[17px] font-light tracking-tight" onClick={() => ask(s)} disabled={busy}>
                  <span>{s}</span>
                  <ArrowRight size={16} className="justify-self-end" />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-6 max-w-xl text-[13.5px] leading-relaxed text-ink-3">
            Answers come from traversal, not grep: question terms are resolved to graph symbols, a 2-hop neighbourhood and
            the shortest paths between them are extracted, and Gemma 4 answers only from that evidence, citing file:line.
          </p>
        </div>
      )}

      {/* turns */}
      <div className="mt-10 space-y-14">
        {turns.map((t, i) => (
          <article key={i} className="rise">
            <div className="rule-ink" />
            <div className="grid gap-6 pt-5 md:grid-cols-12">
              <div className="md:col-span-4">
                <div className="micro">Q{String(i + 1).padStart(2, "0")}</div>
                <h3 className="display display-md mt-2 !leading-[1.1]">{t.q}</h3>
              </div>
              <div className="min-w-0 md:col-span-8">
                <div className="micro flex items-center justify-between pb-3">
                  <span>RepoLens</span>
                  {t.r && <span className="mono normal-case tracking-normal">{t.r.model}</span>}
                </div>
                {!t.r && !t.error && <Thinking />}
                {t.error && <p className="text-bad">{t.error}</p>}
                {t.r && (
                  <>
                    <Markdown>{t.r.answer}</Markdown>
                    <details className="group mt-6">
                      <summary className="micro flex cursor-pointer list-none items-center gap-3 border-t border-rule py-3">
                        Graph evidence
                        <span className="mono normal-case tracking-normal text-ink-3">
                          {t.r.seeds.length} seeds · {t.r.explored.toLocaleString()} explored · {t.r.paths.length} paths · {t.r.evidence.length} edges
                        </span>
                        <ArrowDown size={12} className="ml-auto transition group-open:rotate-180" />
                      </summary>
                      <div className="space-y-6 pb-2">
                        {t.r.seeds.length > 0 && (
                          <div>
                            <div className="micro pb-2">Seed symbols</div>
                            <div className="flex flex-wrap gap-x-5 gap-y-1">
                              {t.r.seeds.map((s, k) => (
                                <span key={k} className="mono text-[12px]" title={s.community}>
                                  <span className="text-ink">{s.label}</span> <span className="text-ink-3">{s.loc}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {t.r.paths.length > 0 && (
                          <div>
                            <div className="micro pb-2">Shortest paths</div>
                            <div className="space-y-2">
                              {t.r.paths.map((p, k) => (
                                <Chain key={k} path={p} />
                              ))}
                            </div>
                          </div>
                        )}
                        {t.r.evidence.length > 0 && (
                          <div>
                            <div className="micro pb-2">Edges handed to Gemma 4</div>
                            <ul className="mono max-h-64 overflow-auto text-[11.5px]">
                              {t.r.evidence.map((e, k) => (
                                <li key={k} className="row grid grid-cols-[16px_1fr_auto] items-center gap-3 py-1.5">
                                  <Prov confidence={e.confidence} label={false} />
                                  <span className="truncate">
                                    <span className="text-ink">{e.source}</span> <span className="text-ink-3">{e.relation} →</span>{" "}
                                    <span className="text-ink">{e.target}</span>
                                  </span>
                                  <span className="truncate text-ink-3">
                                    {e.file}:{e.loc}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </details>
                  </>
                )}
              </div>
            </div>
          </article>
        ))}
        <div ref={bottom} />
      </div>
    </div>
  );
}
