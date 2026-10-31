"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import Logo from "@/components/Logo";
import TourPanel from "@/components/TourPanel";
import AskPanel from "@/components/AskPanel";
import DiagramPanel from "@/components/DiagramPanel";
import { Bar, ModelTag, Skeleton } from "@/components/ui";
import { api, type Summary } from "@/lib/api";

type Tab = "tour" | "graph" | "ask" | "diagram";
const TABS: { id: Tab; label: string; n: string }[] = [
  { id: "tour", label: "Tour", n: "01" },
  { id: "graph", label: "Graph", n: "02" },
  { id: "ask", label: "Ask", n: "03" },
  { id: "diagram", label: "Diagram check", n: "04" },
];

export default function RepoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("tour");
  const [graphKey, setGraphKey] = useState(0);

  useEffect(() => {
    if (!id) return;
    api.summary(id).then(setSummary).catch((e) => setError((e as Error).message));
  }, [id]);

  if (error) {
    return (
      <main className="mx-auto w-full max-w-[1400px] px-6 py-6 md:px-10">
        <Logo />
        <div className="rule-ink mt-5" />
        <div className="py-16">
          <div className="micro !text-bad">Could not load this repository</div>
          <p className="display display-md mt-3 max-w-2xl">{error}</p>
          <button className="btn btn-line mt-8" onClick={() => router.push("/")}>
            <ArrowLeft size={14} /> Back
          </button>
        </div>
      </main>
    );
  }

  const st = summary?.stats;
  const maxDeg = summary ? Math.max(...summary.god_nodes.map((g) => g.degree), 1) : 1;
  const maxSize = summary ? Math.max(...summary.communities.map((c) => c.size), 1) : 1;
  const [owner, repo] = (summary?.name || id || "").split("/");

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col px-6 md:px-10">
      {/* rail */}
      <header className="sticky top-0 z-20 bg-paper/90 backdrop-blur-sm">
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-6">
            <Logo small />
            <nav className="micro hidden items-center gap-6 md:flex">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  data-active={tab === t.id}
                  className={`ulink flex items-baseline gap-1.5 ${tab === t.id ? "!text-ink" : "hover:text-ink"}`}
                  onClick={() => {
                    setTab(t.id);
                    window.scrollTo({ top: 0 });
                  }}
                >
                  <span className="mono text-[9px] tracking-wider text-ink-4">{t.n}</span>
                  {t.label}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            {summary && <ModelTag online={summary.gemma} model={summary.model} />}
            {summary?.repo_url && (
              <a className="micro ulink hidden items-center gap-1 sm:flex" href={summary.repo_url.replace(/\.git$/, "")} target="_blank" rel="noreferrer">
                GitHub <ArrowUpRight size={12} />
              </a>
            )}
          </div>
        </div>
        <div className="rule-ink" />
        {/* mobile tabs */}
        <nav className="micro flex items-center gap-5 py-3 md:hidden">
          {TABS.map((t) => (
            <button key={t.id} data-active={tab === t.id} className="ulink" onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {/* masthead */}
      <section className="grid gap-6 py-8 md:grid-cols-12 md:items-end">
        <div className="md:col-span-8">
          <div className="micro">{owner}</div>
          <h1 className="display display-lg mt-1 break-words">{repo}</h1>
        </div>
        <div className="md:col-span-4">
          {st ? (
            <dl className="grid grid-cols-4 gap-3">
              {[
                ["Nodes", st.nodes.toLocaleString()],
                ["Edges", st.edges.toLocaleString()],
                ["Subsystems", String(st.communities)],
                ["Files", String(st.files)],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="micro">{k}</dt>
                  <dd className="num mt-1 text-[22px]">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <Skeleton lines={2} />
          )}
          {st && (
            <div className="mono mt-3 text-[11px] text-ink-3">
              {st.languages.map((l) => `${l.ext} ${l.files}`).join(" · ")}
              {st.built_at_commit && <> · @{st.built_at_commit.slice(0, 7)}</>}
            </div>
          )}
        </div>
      </section>

      <div className="grid flex-1 gap-10 pb-16 lg:grid-cols-12">
        {/* main */}
        <main className="min-w-0 lg:col-span-9">
          {!summary && (
            <div className="py-6">
              <Skeleton lines={6} />
            </div>
          )}
          {summary && tab === "tour" && <TourPanel repoId={id} onRelabelled={() => setGraphKey((k) => k + 1)} />}
          {summary && tab === "graph" && (
            <figure>
              <div className="night relative overflow-hidden rounded-lg" style={{ height: "calc(100vh - 220px)", minHeight: 520 }}>
                <iframe key={graphKey} src={api.graphHtmlUrl(id)} title="Graphify interactive graph" className="h-full w-full" />
              </div>
              <figcaption className="micro flex items-center justify-between pt-3">
                <span>
                  Fig. 02 — Graphify knowledge graph · {st?.nodes.toLocaleString()} nodes · {st?.communities} communities
                </span>
                <span>click a node · filter communities · search</span>
              </figcaption>
            </figure>
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

        {/* facts */}
        {summary && (
          <aside className="hidden lg:col-span-3 lg:block">
            <div className="sticky top-[76px]">
              <div className="rule-ink" />
              <div className="flex items-baseline justify-between py-3">
                <span className="micro !text-ink">Graph facts</span>
                <span className="micro">deterministic</span>
              </div>

              <div className="micro pb-2 pt-1">God nodes · most connected</div>
              <ol>
                {summary.god_nodes.slice(0, 8).map((g, i) => (
                  <li key={g.id} className="row py-2">
                    <div className="flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="flex items-baseline gap-2 truncate">
                        <span className="mono text-[10px] text-ink-4">{String(i + 1).padStart(2, "0")}</span>
                        <span className="truncate font-medium">{g.label}</span>
                        {g.is_test && <span className="micro !text-ink-4">test</span>}
                      </span>
                      <span className="num text-[14px]">{g.degree}</span>
                    </div>
                    <Bar value={g.degree} max={maxDeg} className="mt-1.5" />
                    <div className="mono mt-1 truncate text-[10px] text-ink-3">{g.loc}</div>
                  </li>
                ))}
              </ol>

              <div className="micro pb-2 pt-6">Largest subsystems</div>
              <ol>
                {summary.communities.slice(0, 7).map((c) => (
                  <li key={c.id} className="row py-2">
                    <div className="flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="flex items-baseline gap-2 truncate">
                        <span className="mono text-[10px] text-ink-4">C{c.id}</span>
                        <span className="truncate">{c.label.startsWith("Community ") ? c.hub : c.label}</span>
                      </span>
                      <span className="num text-[14px]">{c.size}</span>
                    </div>
                    <Bar value={c.size} max={maxSize} className="mt-1.5" />
                  </li>
                ))}
              </ol>

              {summary.surprises.length > 0 && (
                <>
                  <div className="micro pb-2 pt-6">Surprising edges</div>
                  <ul className="mono text-[11px] text-ink-2">
                    {summary.surprises.slice(0, 4).map((s, i) => (
                      <li key={i} className="row truncate py-1.5" title={s.why}>
                        {s.source} <span className="text-accent">→</span> {s.target}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <p className="micro pt-6 !normal-case !tracking-normal leading-relaxed">
                Facts from Graphify (tree-sitter AST, Leiden). Narration by <span className="mono text-ink">{summary.model}</span>
                {!summary.gemma && <span className="text-warn"> — offline, graph-only mode</span>}.
              </p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
