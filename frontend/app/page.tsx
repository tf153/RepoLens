"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Boxes,
  Braces,
  Code2,
  GitBranch,
  Image as ImageIcon,
  MessageSquareText,
  Network,
  Sparkles,
  Terminal,
  Waypoints,
} from "lucide-react";
import Logo from "@/components/Logo";
import { ActionStream, type Step } from "@/components/ui";
import { api, type Job, type RepoListItem } from "@/lib/api";

const ORDER = ["queued", "cloning", "extracting", "reporting", "ready"];
const EXAMPLES = ["encode/starlette", "pallets/flask", "tiangolo/fastapi"];

function pipelineSteps(job: Job | null, busy: boolean): Step[] {
  const cur = job ? ORDER.indexOf(job.status) : busy ? 0 : -1;
  const err = job?.status === "error";
  const mk = (idx: number, label: string, detail: string): Step => ({
    label,
    detail,
    state: err && idx === cur ? "error" : idx < cur ? "done" : idx === cur ? "active" : "pending",
  });
  return [
    mk(1, "Clone repository", "git clone --depth 1 · public repos only"),
    mk(2, "Graphify: parse AST → knowledge graph", job?.stats?.nodes ? `${job.stats.nodes} nodes · ${job.stats.edges} edges` : "tree-sitter, deterministic, no LLM"),
    mk(3, "Leiden communities · god nodes · report", job?.stats?.communities ? `${job.stats.communities} communities` : "GRAPH_REPORT.md + interactive graph.html"),
    { label: "Ready — open the tour", state: cur >= 4 ? "done" : "pending" },
  ];
}

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repos, setRepos] = useState<RepoListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.repos().then(setRepos).catch(() => setRepos([]));
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function poll(id: string) {
    try {
      const j = await api.job(id);
      setJob(j);
      if (j.status === "ready") return router.push(`/r/${id}`);
      if (j.status === "error") {
        setBusy(false);
        setError(j.message);
        return;
      }
      timer.current = setTimeout(() => poll(id), 1500);
    } catch (e) {
      setBusy(false);
      setError((e as Error).message);
    }
  }

  async function start(target: string) {
    setError(null);
    setJob(null);
    setBusy(true);
    try {
      const r = await api.analyze(target);
      if (r.status === "ready") return router.push(`/r/${r.job_id}`);
      poll(r.job_id);
    } catch (e) {
      setBusy(false);
      setError((e as Error).message);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 pb-16">
      {/* nav */}
      <header className="glass mt-5 flex items-center justify-between px-4 py-2.5">
        <Logo small />
        <nav className="flex items-center gap-2">
          <span className="pill pill-violet hidden sm:inline-flex">
            <Sparkles size={12} /> Gemma 4 · Graphify
          </span>
          <a className="btn-ghost !px-3 !py-1.5 text-xs" href="https://github.com/tf153/RepoLens/blob/main/skills/repolens/SKILL.md" target="_blank" rel="noreferrer">
            <Terminal size={13} /> /repolens skill
          </a>
          <a className="btn-ghost !px-3 !py-1.5 text-xs" href="https://github.com/tf153/RepoLens" target="_blank" rel="noreferrer">
            <Code2 size={13} /> GitHub
          </a>
        </nav>
      </header>

      {/* hero */}
      <section className="mx-auto mt-20 max-w-3xl text-center">
        <span className="pill pill-accent rise">
          <span className="h-1.5 w-1.5 rounded-full bg-accent dot-live" /> Open-source · Apache-2.0 · open-weight AI
        </span>
        <h1 className="rise rise-1 mt-6 text-[44px] font-semibold leading-[1.05] tracking-[-0.02em] md:text-[64px]">
          Understand any codebase <span className="grad-text">in minutes</span>, not weeks.
        </h1>
        <p className="rise rise-2 mx-auto mt-5 max-w-2xl text-[17px] leading-relaxed text-muted">
          Paste a public repo. <b className="text-fg">Graphify</b> maps it into a knowledge graph — no LLM, no vector
          store. <b className="text-fg">Gemma&nbsp;4</b> reads the graph and gives you a guided tour, answers &ldquo;how
          does X reach Y?&rdquo; by walking edges, and checks your whiteboard against the real architecture.
        </p>

        {/* command bar */}
        <form
          className="rise rise-3 glass mx-auto mt-9 flex max-w-2xl items-center gap-2 p-2 pl-4 glow"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) start(url.trim());
          }}
        >
          <GitBranch size={18} className="shrink-0 text-accent" />
          <input
            className="w-full bg-transparent py-2 text-[15px] text-fg outline-none placeholder:text-muted-2"
            placeholder="https://github.com/owner/repo"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
            autoFocus
          />
          <button className="btn-primary whitespace-nowrap" disabled={busy || !url.trim()}>
            {busy ? "Mapping…" : "Map it"} <ArrowRight size={16} />
          </button>
        </form>
        <div className="rise rise-4 mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-muted">
          <span>Try:</span>
          {EXAMPLES.map((ex) => (
            <button key={ex} className="pill hover:text-fg" disabled={busy} onClick={() => start(`https://github.com/${ex}`)}>
              {ex}
            </button>
          ))}
        </div>

        {/* agent action stream */}
        {(job || busy || error) && (
          <div className="glass mx-auto mt-8 max-w-2xl p-5 text-left rise">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Network size={15} className="text-accent" /> Agent pipeline
                {job?.name && <span className="mono text-muted">· {job.name}</span>}
              </div>
              <span className={`pill ${error ? "pill-bad" : "pill-accent"}`}>{error ? "failed" : job?.status || "starting"}</span>
            </div>
            <ActionStream steps={pipelineSteps(job, busy)} />
            {job?.message && !error && <div className="mono mt-4 text-xs text-muted">{job.message}</div>}
            {error && (
              <div className="mt-4 rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad">
                {error}
              </div>
            )}
          </div>
        )}
      </section>

      {/* already mapped */}
      {repos.length > 0 && (
        <section className="mt-20">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <div className="eyebrow">Already mapped</div>
              <h2 className="mt-1 text-xl font-semibold">Open instantly</h2>
            </div>
            <span className="text-xs text-muted">{repos.length} repos cached on this node</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {repos.map((r, i) => {
              const max = Math.max(...repos.map((x) => x.stats.nodes || 0), 1);
              return (
                <button
                  key={r.id}
                  onClick={() => router.push(`/r/${r.id}`)}
                  className={`glass glass-hover rise rise-${(i % 4) + 1} group p-5 text-left`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet/15 text-accent-2">
                        <Boxes size={16} />
                      </span>
                      <div className="font-medium group-hover:text-accent">{r.name}</div>
                    </div>
                    {r.has_tour ? <span className="pill pill-violet">tour cached</span> : <span className="pill">graph ready</span>}
                  </div>
                  <div className="mono mt-4 grid grid-cols-3 gap-2 text-[11px] text-muted">
                    <div>
                      <div className="text-base text-fg">{r.stats.nodes?.toLocaleString() ?? "?"}</div>nodes
                    </div>
                    <div>
                      <div className="text-base text-fg">{r.stats.edges?.toLocaleString() ?? "?"}</div>edges
                    </div>
                    <div>
                      <div className="text-base text-fg">{r.stats.communities ?? "?"}</div>subsystems
                    </div>
                  </div>
                  <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/5">
                    <div className="h-full grad-bg" style={{ width: `${Math.max(8, ((r.stats.nodes || 0) / max) * 100)}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* how it works */}
      <section className="mt-20">
        <div className="eyebrow">How it works</div>
        <h2 className="mt-1 text-xl font-semibold">Graph first. Model second. Evidence always.</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Waypoints,
              t: "1 · Build the graph",
              d: "Graphify parses every function, class, import and call with tree-sitter. Leiden clustering finds subsystems; the most connected symbols become god nodes. Deterministic and local.",
              tag: "Graphify",
            },
            {
              icon: Braces,
              t: "2 · Narrate it",
              d: "Gemma 4 is shown only graph evidence with file:line citations — god nodes, communities, surprising edges — and writes the architecture summary, start-here list and onboarding doc.",
              tag: "Gemma 4 · text",
            },
            {
              icon: ImageIcon,
              t: "3 · Verify against reality",
              d: "Ask structural questions answered by traversal with EXTRACTED / INFERRED provenance on every edge, or upload a whiteboard photo and let Gemma 4 vision flag architectural drift.",
              tag: "Gemma 4 · vision",
            },
          ].map(({ icon: Icon, t, d, tag }, i) => (
            <div key={t} className={`glass glass-hover rise rise-${i + 1} p-5`}>
              <div className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl grad-bg text-white">
                  <Icon size={17} />
                </span>
                <span className="pill">{tag}</span>
              </div>
              <div className="mt-4 font-semibold">{t}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* skill callout */}
      <section className="glass mt-10 flex flex-col items-start justify-between gap-4 p-5 md:flex-row md:items-center">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet/15 text-accent-2">
            <MessageSquareText size={17} />
          </span>
          <div>
            <div className="font-semibold">Also an Agent Skill</div>
            <div className="mt-0.5 text-sm text-muted">
              Type <span className="mono text-accent">/repolens</span> in Cursor, Claude Code or Codex: builds the graph, writes{" "}
              <span className="mono">ONBOARDING.md</span>, and answers structural questions with{" "}
              <span className="mono">graphify path / explain / query</span>.
            </div>
          </div>
        </div>
        <a className="btn-ghost whitespace-nowrap" href="https://github.com/tf153/RepoLens/tree/main/skills/repolens" target="_blank" rel="noreferrer">
          View SKILL.md <ArrowRight size={14} />
        </a>
      </section>

      <footer className="mt-14 flex flex-col items-center justify-between gap-2 text-xs text-muted md:flex-row">
        <div>
          Open-weight model <span className="mono text-fg">gemma-4-26b-a4b-it</span> via the Gemini API · graph layer{" "}
          <span className="mono text-fg">graphifyy</span> (Apache-2.0)
        </div>
        <div>Frontend on Cloudways Velocity · API on a DigitalOcean Droplet</div>
      </footer>
    </main>
  );
}
