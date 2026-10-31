"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import TourPanel from "@/components/TourPanel";
import AskPanel from "@/components/AskPanel";
import DiagramPanel from "@/components/DiagramPanel";
import { api, type Summary } from "@/lib/api";

type Tab = "tour" | "graph" | "ask" | "diagram";
const TABS: { id: Tab; label: string }[] = [
  { id: "tour", label: "Tour" },
  { id: "graph", label: "Graph" },
  { id: "ask", label: "Ask" },
  { id: "diagram", label: "Diagram check" },
];

export default function RepoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("tour");
  const [graphKey, setGraphKey] = useState(0);
  const [sideOpen, setSideOpen] = useState(true);

  useEffect(() => {
    if (!id) return;
    api.summary(id).then(setSummary).catch((e) => setError((e as Error).message));
  }, [id]);

  if (error) {
    return (
      <main className="mx-auto max-w-2xl p-10">
        <Logo />
        <div className="card mt-8 border-bad/50 p-5">
          <div className="font-medium text-bad">Could not load repo</div>
          <div className="mt-1 text-sm text-muted">{error}</div>
          <button className="btn-ghost mt-4" onClick={() => router.push("/")}>
            Back
          </button>
        </div>
      </main>
    );
  }

  const st = summary?.stats;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/80 backdrop-blur">
        <div className="flex items-center gap-4 px-4 py-2.5">
          <Logo small />
          <div className="h-5 w-px bg-border" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">
              {summary?.name || id}
              {summary?.repo_url && (
                <a className="ml-2 text-xs text-muted hover:text-accent" href={summary.repo_url.replace(/\.git$/, "")} target="_blank" rel="noreferrer">
                  open on GitHub ↗
                </a>
              )}
            </div>
            {st && (
              <div className="mono text-[11px] text-muted">
                {st.nodes} nodes · {st.edges} edges · {st.communities} communities · {st.files} files ·{" "}
                {st.languages.map((l) => l.ext).join(", ")}
                {st.built_at_commit && <> · {st.built_at_commit.slice(0, 7)}</>}
              </div>
            )}
          </div>
          <nav className="flex items-center gap-1 rounded-lg border border-border bg-panel p-1">
            {TABS.map((t) => (
              <button key={t.id} className={`tab ${tab === t.id ? "tab-active" : ""}`} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setSideOpen((v) => !v)} title="Toggle sidebar">
            {sideOpen ? "Hide graph facts" : "Graph facts"}
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        {sideOpen && summary && (
          <aside className="hidden w-80 shrink-0 border-r border-border p-4 lg:block">
            <section>
              <h3 className="text-xs uppercase tracking-wider text-muted">God nodes</h3>
              <ul className="mt-2 space-y-1.5">
                {summary.god_nodes.slice(0, 10).map((g) => (
                  <li key={g.id} className="text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-medium">{g.label}</span>
                      <span className="mono text-xs text-accent">{g.degree}</span>
                    </div>
                    <div className="mono truncate text-[11px] text-muted">{g.loc}</div>
                  </li>
                ))}
              </ul>
            </section>
            <section className="mt-6">
              <h3 className="text-xs uppercase tracking-wider text-muted">Largest communities</h3>
              <ul className="mt-2 space-y-1.5">
                {summary.communities.slice(0, 8).map((c) => (
                  <li key={c.id} className="text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate">
                        <span className="mono mr-1 text-xs text-muted">C{c.id}</span>
                        {c.label.startsWith("Community ") ? c.hub : c.label}
                      </span>
                      <span className="mono text-xs text-muted">{c.size}</span>
                    </div>
                    <div className="truncate text-[11px] text-muted">{c.sample.slice(0, 3).join(" · ")}</div>
                  </li>
                ))}
              </ul>
            </section>
            {summary.surprises.length > 0 && (
              <section className="mt-6">
                <h3 className="text-xs uppercase tracking-wider text-muted">Surprising edges</h3>
                <ul className="mono mt-2 space-y-1 text-[11px] text-muted">
                  {summary.surprises.slice(0, 5).map((s, i) => (
                    <li key={i} className="truncate" title={s.why}>
                      <span className="text-fg">{s.source}</span> ─{s.relation}→ <span className="text-fg">{s.target}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="mt-6 text-[11px] text-muted">
              Graph: Graphify (tree-sitter, Leiden). Reasoning: <span className="mono">{summary.model}</span>
              {!summary.gemma && <span className="text-warn"> · Gemma offline (no API key)</span>}
            </section>
          </aside>
        )}

        <main className="min-w-0 flex-1 p-4">
          {!summary && <div className="card p-6 text-muted">Loading graph summary…</div>}
          {summary && tab === "tour" && <TourPanel repoId={id} onRelabelled={() => setGraphKey((k) => k + 1)} />}
          {summary && tab === "graph" && (
            <div className="card overflow-hidden" style={{ height: "calc(100vh - 110px)" }}>
              <iframe
                key={graphKey}
                src={api.graphHtmlUrl(id)}
                title="Graphify interactive graph"
                className="h-full w-full bg-white"
              />
            </div>
          )}
          {summary && tab === "ask" && (
            <AskPanel
              repoId={id}
              suggestions={[
                ...(summary.god_nodes.length >= 2
                  ? [`How does ${summary.god_nodes[1].label} reach ${summary.god_nodes[0].label}?`]
                  : []),
                `What depends on ${summary.god_nodes[0]?.label ?? "the main class"}?`,
                "Where does a request enter the system and where does it exit?",
              ]}
            />
          )}
          {summary && tab === "diagram" && <DiagramPanel repoId={id} />}
        </main>
      </div>
    </div>
  );
}
