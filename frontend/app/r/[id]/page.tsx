"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Compass,
  ExternalLink,
  Image as ImageIcon,
  MessageSquareText,
  Network,
  PanelRightClose,
  PanelRightOpen,
  Zap,
} from "lucide-react";
import Logo from "@/components/Logo";
import TourPanel from "@/components/TourPanel";
import AskPanel from "@/components/AskPanel";
import DiagramPanel from "@/components/DiagramPanel";
import { Bar, GemmaBadge, Skeleton } from "@/components/ui";
import { api, type Summary } from "@/lib/api";

type Tab = "tour" | "graph" | "ask" | "diagram";
const TABS: { id: Tab; label: string; icon: typeof Compass }[] = [
  { id: "tour", label: "Tour", icon: Compass },
  { id: "graph", label: "Graph", icon: Network },
  { id: "ask", label: "Ask", icon: MessageSquareText },
  { id: "diagram", label: "Diagram check", icon: ImageIcon },
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
      <main className="mx-auto max-w-xl p-10">
        <Logo />
        <div className="glass mt-8 border-bad/40 p-6">
          <div className="font-semibold text-bad">Could not load this repository</div>
          <div className="mt-1 text-sm text-muted">{error}</div>
          <button className="btn-ghost mt-5" onClick={() => router.push("/")}>
            <ArrowLeft size={14} /> Back
          </button>
        </div>
      </main>
    );
  }

  const st = summary?.stats;
  const maxDeg = summary ? Math.max(...summary.god_nodes.map((g) => g.degree), 1) : 1;
  const maxSize = summary ? Math.max(...summary.communities.map((c) => c.size), 1) : 1;

  return (
    <div className="flex min-h-screen flex-col">
      {/* header */}
      <header className="sticky top-0 z-20 px-3 pt-3">
        <div className="glass glass-solid flex items-center gap-3 px-3 py-2">
          <Logo small />
          <span className="h-6 w-px bg-line" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 truncate">
              <span className="truncate font-semibold">{summary?.name || id}</span>
              {summary?.repo_url && (
                <a
                  className="text-muted hover:text-accent"
                  href={summary.repo_url.replace(/\.git$/, "")}
                  target="_blank"
                  rel="noreferrer"
                  title="Open on GitHub"
                >
                  <ExternalLink size={13} />
                </a>
              )}
            </div>
            {st ? (
              <div className="mono flex flex-wrap gap-x-3 text-[11px] text-muted">
                <span>
                  <b className="text-fg">{st.nodes.toLocaleString()}</b> nodes
                </span>
                <span>
                  <b className="text-fg">{st.edges.toLocaleString()}</b> edges
                </span>
                <span>
                  <b className="text-fg">{st.communities}</b> subsystems
                </span>
                <span>
                  <b className="text-fg">{st.files}</b> files · {st.languages.map((l) => l.ext).join(", ")}
                </span>
                {st.built_at_commit && <span>@{st.built_at_commit.slice(0, 7)}</span>}
              </div>
            ) : (
              <div className="shimmer mt-1 h-3 w-64" />
            )}
          </div>

          <nav className="hidden items-center gap-1 rounded-xl border border-line bg-black/20 p-1 md:flex">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`tab flex items-center gap-1.5 ${tab === t.id ? "tab-active" : ""}`}
                onClick={() => {
                  setTab(t.id);
                  window.scrollTo({ top: 0 });
                }}
              >
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </nav>

          {summary && <GemmaBadge online={summary.gemma} model={summary.model} />}
          <button
            className="btn-ghost hidden !px-2 !py-1.5 lg:inline-flex"
            onClick={() => setSideOpen((v) => !v)}
            title="Toggle graph facts"
          >
            {sideOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
          </button>
        </div>
        {/* mobile tabs */}
        <nav className="glass mt-2 flex items-center gap-1 p-1 md:hidden">
          {TABS.map((t) => (
            <button key={t.id} className={`tab flex-1 ${tab === t.id ? "tab-active" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex flex-1 gap-3 p-3">
        {/* main */}
        <main className="min-w-0 flex-1">
          {!summary && (
            <div className="glass p-6">
              <Skeleton lines={5} />
            </div>
          )}
          {summary && tab === "tour" && <TourPanel repoId={id} onRelabelled={() => setGraphKey((k) => k + 1)} />}
          {summary && tab === "graph" && (
            <div className="glass relative overflow-hidden" style={{ height: "calc(100vh - 96px)" }}>
              <div className="pointer-events-none absolute left-3 top-3 z-[1] flex gap-2">
                <span className="pill pill-accent">Graphify graph.html · interactive</span>
                <span className="pill">click a node · filter communities · search</span>
              </div>
              <iframe key={graphKey} src={api.graphHtmlUrl(id)} title="Graphify interactive graph" className="h-full w-full" />
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

        {/* graph facts sidebar */}
        {sideOpen && summary && (
          <aside className="glass hidden w-[300px] shrink-0 self-start p-4 lg:block" style={{ position: "sticky", top: 76 }}>
            <div className="mb-3 flex items-center gap-2">
              <Zap size={14} className="text-accent" />
              <span className="eyebrow !text-fg">Graph facts</span>
              <span className="ml-auto pill">deterministic</span>
            </div>

            <section>
              <div className="eyebrow mb-2">God nodes · most connected</div>
              <ul className="space-y-2">
                {summary.god_nodes.slice(0, 8).map((g) => (
                  <li key={g.id}>
                    <div className="flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="truncate font-medium">
                        {g.label}
                        {g.is_test && <span className="ml-1.5 text-[10px] font-normal text-muted-2">test</span>}
                      </span>
                      <span className="mono text-xs text-accent">{g.degree}</span>
                    </div>
                    <Bar value={g.degree} max={maxDeg} className="mt-1" />
                    <div className="mono mt-0.5 truncate text-[10.5px] text-muted-2">{g.loc}</div>
                  </li>
                ))}
              </ul>
            </section>

            <div className="grad-line my-4" />

            <section>
              <div className="eyebrow mb-2">Largest subsystems</div>
              <ul className="space-y-2">
                {summary.communities.slice(0, 7).map((c) => (
                  <li key={c.id}>
                    <div className="flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="truncate">
                        <span className="mono mr-1.5 text-[10px] text-muted-2">C{c.id}</span>
                        {c.label.startsWith("Community ") ? c.hub : c.label}
                      </span>
                      <span className="mono text-xs text-muted">{c.size}</span>
                    </div>
                    <Bar value={c.size} max={maxSize} className="mt-1" />
                  </li>
                ))}
              </ul>
            </section>

            {summary.surprises.length > 0 && (
              <>
                <div className="grad-line my-4" />
                <section>
                  <div className="eyebrow mb-2">Surprising edges</div>
                  <ul className="mono space-y-1 text-[11px] text-muted">
                    {summary.surprises.slice(0, 4).map((s, i) => (
                      <li key={i} className="truncate" title={s.why}>
                        <span className="text-fg">{s.source}</span> <span className="text-warn">─{s.relation}→</span>{" "}
                        <span className="text-fg">{s.target}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            )}

            <div className="mt-4 rounded-lg border border-line bg-black/20 p-2.5 text-[11px] leading-relaxed text-muted">
              Facts from <span className="text-fg">Graphify</span> (tree-sitter AST, Leiden). Narration by{" "}
              <span className="mono text-accent-2">{summary.model}</span>
              {!summary.gemma && <span className="text-warn"> — offline, graph-only mode</span>}.
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
