"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronDown, GitCommitHorizontal, Route, Sparkles, User } from "lucide-react";
import Markdown from "./Markdown";
import { ActionStream, ConfidencePill, type Step } from "./ui";
import { api, type ChatResult, type EdgeRow } from "@/lib/api";

interface Turn {
  q: string;
  r?: ChatResult;
  error?: string;
  startedAt: number;
}

function thinkingSteps(elapsedMs: number): Step[] {
  const stage = elapsedMs < 400 ? 0 : elapsedMs < 1200 ? 1 : elapsedMs < 2200 ? 2 : 3;
  const st = (i: number): Step["state"] => (i < stage ? "done" : i === stage ? "active" : "pending");
  return [
    { label: "Resolve question terms to graph symbols", state: st(0) },
    { label: "Traverse 2-hop neighbourhood", state: st(1) },
    { label: "Compute shortest paths between seeds", state: st(2) },
    { label: "Gemma 4 composes the answer from evidence only", state: st(3) },
  ];
}

function Chain({ path }: { path: EdgeRow[] }) {
  if (!path.length) return null;
  return (
    <div className="mono flex flex-wrap items-center gap-1 text-[12px]">
      <span className="rounded-md border border-line bg-black/30 px-1.5 py-0.5 text-fg" title={path[0].source_loc}>
        {path[0].source}
      </span>
      {path.map((e, i) => (
        <span key={i} className="flex items-center gap-1">
          <span className={`text-[11px] ${e.confidence === "EXTRACTED" ? "text-ok" : "text-warn"}`}>─{e.relation}→</span>
          <span className="rounded-md border border-line bg-black/30 px-1.5 py-0.5 text-fg" title={e.target_loc}>
            {e.target}
          </span>
        </span>
      ))}
    </div>
  );
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

export default function AskPanel({ repoId, suggestions }: { repoId: string; suggestions: string[] }) {
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setBusy(true);
    setQ("");
    const idx = turns.length;
    setTurns((t) => [...t, { q: question, startedAt: Date.now() }]);
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
    <div className="flex flex-col gap-3" style={{ minHeight: "calc(100vh - 96px)" }}>
      {/* intro / empty state */}
      {turns.length === 0 && (
        <div className="glass p-6 rise">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg grad-bg text-white">
              <Route size={15} />
            </span>
            <div>
              <div className="font-semibold">Ask the graph</div>
              <div className="text-xs text-muted">
                Answers come from traversal, not grep. Every hop carries provenance:{" "}
                <ConfidencePill confidence="EXTRACTED" /> explicit in source · <ConfidencePill confidence="INFERRED" /> resolved by Graphify.
              </div>
            </div>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            {suggestions.map((s) => (
              <button key={s} className="inset group p-3 text-left text-[13px] transition hover:border-line-2" onClick={() => ask(s)} disabled={busy}>
                <div className="text-muted group-hover:text-fg">{s}</div>
                <div className="mt-2 flex items-center gap-1 text-[11px] text-accent opacity-0 transition group-hover:opacity-100">
                  Ask <ArrowUp size={11} className="rotate-45" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* conversation */}
      <div className="flex-1 space-y-4">
        {turns.map((t, i) => (
          <div key={i} className="space-y-3 rise">
            {/* user bubble */}
            <div className="flex justify-end">
              <div className="glass glass-2 max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 text-[14.5px]">
                <div className="mb-1 flex items-center justify-end gap-1.5 text-[10.5px] text-muted">
                  you <User size={11} />
                </div>
                {t.q}
              </div>
            </div>
            {/* agent bubble */}
            <div className="flex gap-3">
              <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl grad-bg text-white" style={{ boxShadow: "0 6px 18px -8px rgba(139,92,246,.9)" }}>
                <Sparkles size={15} />
              </span>
              <div className="glass min-w-0 flex-1 rounded-2xl rounded-tl-md p-4">
                <div className="mb-1.5 flex items-center gap-2 text-[10.5px] text-muted">
                  RepoLens
                  {t.r && <span className="mono pill !py-0 text-[10px]">{t.r.model}</span>}
                </div>
                {!t.r && !t.error && <Thinking />}
                {t.error && <div className="text-sm text-bad">{t.error}</div>}
                {t.r && (
                  <>
                    <Markdown>{t.r.answer}</Markdown>
                    <details className="group mt-3 rounded-xl border border-line bg-black/25">
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[12.5px] text-muted">
                        <GitCommitHorizontal size={13} className="text-accent" />
                        Graph evidence
                        <span className="mono text-[11px]">
                          · {t.r.seeds.length} seeds · {t.r.explored.toLocaleString()} explored · {t.r.paths.length} paths · {t.r.evidence.length} edges
                        </span>
                        <ChevronDown size={13} className="ml-auto transition group-open:rotate-180" />
                      </summary>
                      <div className="space-y-4 border-t border-line p-3">
                        {t.r.seeds.length > 0 && (
                          <div>
                            <div className="eyebrow mb-1.5">Seed symbols</div>
                            <div className="flex flex-wrap gap-1.5">
                              {t.r.seeds.map((s, k) => (
                                <span key={k} className="pill mono" title={s.community}>
                                  <span className="text-fg">{s.label}</span>
                                  <span className="text-muted-2">{s.loc}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {t.r.paths.length > 0 && (
                          <div>
                            <div className="eyebrow mb-1.5">Shortest paths</div>
                            <div className="space-y-1.5">
                              {t.r.paths.map((p, k) => (
                                <Chain key={k} path={p} />
                              ))}
                            </div>
                          </div>
                        )}
                        {t.r.evidence.length > 0 && (
                          <div>
                            <div className="eyebrow mb-1.5">Edges handed to Gemma 4</div>
                            <ul className="mono max-h-56 space-y-1 overflow-auto pr-1 text-[11.5px] text-muted">
                              {t.r.evidence.map((e, k) => (
                                <li key={k} className="flex flex-wrap items-center gap-x-1.5">
                                  <span className="text-fg">{e.source}</span>
                                  <span className="text-muted-2">─{e.relation}→</span>
                                  <span className="text-fg">{e.target}</span>
                                  <ConfidencePill confidence={e.confidence} />
                                  <span className="text-muted-2">
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
          </div>
        ))}
        <div ref={bottom} />
      </div>

      {/* composer */}
      <form
        className="glass glass-solid sticky bottom-3 flex items-center gap-2 p-2 pl-4 glow"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <Route size={16} className="shrink-0 text-accent" />
        <input
          className="w-full bg-transparent py-2 text-[14.5px] text-fg outline-none placeholder:text-muted-2"
          placeholder='Ask a structural question — "how does auth reach the database?"'
          value={q}
          onChange={(e) => setQ(e.target.value)}
          disabled={busy}
        />
        <button className="btn-primary !rounded-lg !px-3 !py-2" disabled={busy || !q.trim()} title="Ask">
          <ArrowUp size={16} />
        </button>
      </form>
    </div>
  );
}
