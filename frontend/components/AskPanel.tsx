"use client";

import { useState } from "react";
import Markdown from "./Markdown";
import { api, type ChatResult, type EdgeRow } from "@/lib/api";

interface Turn {
  q: string;
  r?: ChatResult;
  error?: string;
}

function Chain({ path }: { path: EdgeRow[] }) {
  if (!path.length) return null;
  return (
    <div className="mono flex flex-wrap items-center gap-1 text-[12px]">
      <span className="rounded bg-panel-2 px-1.5 py-0.5 text-fg">{path[0].source}</span>
      {path.map((e, i) => (
        <span key={i} className="flex items-center gap-1">
          <span className={`text-[11px] ${e.confidence === "EXTRACTED" ? "text-ok" : "text-warn"}`}>
            ─{e.relation}→
          </span>
          <span className="rounded bg-panel-2 px-1.5 py-0.5 text-fg" title={e.target_loc}>
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
    <div className="flex h-full flex-col gap-4">
      <div className="card p-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask(q);
          }}
        >
          <input
            className="input"
            placeholder='Ask a structural question, e.g. "how does auth reach the database?"'
            value={q}
            onChange={(e) => setQ(e.target.value)}
            disabled={busy}
          />
          <button className="btn-primary" disabled={busy || !q.trim()}>
            {busy ? "Tracing…" : "Ask"}
          </button>
        </form>
        {turns.length === 0 && suggestions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button key={s} className="pill hover:border-accent hover:text-fg" onClick={() => ask(s)} disabled={busy}>
                {s}
              </button>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-muted">
          Answers come from traversing the Graphify graph (seed symbols → 2-hop neighbourhood → shortest paths), not from
          grepping files. <span className="text-ok">Green</span> edges are EXTRACTED from source,{" "}
          <span className="text-warn">amber</span> are INFERRED.
        </p>
      </div>

      <div className="space-y-4">
        {turns.map((t, i) => (
          <div key={i} className="card p-4">
            <div className="text-sm font-medium text-accent">You</div>
            <div className="mt-1">{t.q}</div>
            <div className="mt-4 text-sm font-medium text-accent-2">RepoLens</div>
            {!t.r && !t.error && (
              <div className="mt-2 flex items-center gap-2 text-sm text-muted">
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent-2" /> Traversing graph, then asking Gemma 4…
              </div>
            )}
            {t.error && <div className="mt-2 text-sm text-bad">{t.error}</div>}
            {t.r && (
              <>
                <Markdown className="mt-1">{t.r.answer}</Markdown>
                <details className="mt-3 rounded-lg border border-border bg-panel-2/60 p-3">
                  <summary className="cursor-pointer text-sm text-muted">
                    Graph evidence · {t.r.seeds.length} seeds · {t.r.explored} nodes explored · {t.r.paths.length} paths ·{" "}
                    {t.r.evidence.length} edges
                  </summary>
                  <div className="mt-3 space-y-3">
                    {t.r.seeds.length > 0 && (
                      <div>
                        <div className="text-xs uppercase tracking-wider text-muted">Seed symbols</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {t.r.seeds.map((s, k) => (
                            <span key={k} className="pill mono" title={s.community}>
                              {s.label} <span className="ml-1 text-muted">{s.loc}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {t.r.paths.length > 0 && (
                      <div>
                        <div className="text-xs uppercase tracking-wider text-muted">Shortest paths</div>
                        <div className="mt-1 space-y-1">
                          {t.r.paths.map((p, k) => (
                            <Chain key={k} path={p} />
                          ))}
                        </div>
                      </div>
                    )}
                    {t.r.evidence.length > 0 && (
                      <div>
                        <div className="text-xs uppercase tracking-wider text-muted">Edges handed to Gemma 4</div>
                        <ul className="mono mt-1 max-h-56 space-y-0.5 overflow-auto text-[11.5px] text-muted">
                          {t.r.evidence.map((e, k) => (
                            <li key={k}>
                              <span className="text-fg">{e.source}</span> ─{e.relation}→{" "}
                              <span className="text-fg">{e.target}</span>{" "}
                              <span className={e.confidence === "EXTRACTED" ? "text-ok" : "text-warn"}>[{e.confidence}]</span>{" "}
                              {e.file}:{e.loc}
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
        ))}
      </div>
    </div>
  );
}
