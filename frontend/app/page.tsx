"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { api, type Job, type RepoListItem } from "@/lib/api";

const STEPS: Record<string, string> = {
  queued: "Queued",
  cloning: "Cloning (depth 1)",
  extracting: "Graphify: tree-sitter AST → graph",
  reporting: "Leiden communities, god nodes, report",
  ready: "Ready",
  error: "Failed",
};

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
      if (j.status === "ready") {
        router.push(`/r/${id}`);
        return;
      }
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

  async function start(target: string, force = false) {
    setError(null);
    setJob(null);
    setBusy(true);
    try {
      const r = await api.analyze(target, force);
      if (r.status === "ready") {
        router.push(`/r/${r.job_id}`);
        return;
      }
      poll(r.job_id);
    } catch (e) {
      setBusy(false);
      setError((e as Error).message);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-10">
      <header className="flex items-center justify-between">
        <Logo />
        <a
          className="pill hover:text-fg"
          href="https://github.com/tf153/RepoLens"
          target="_blank"
          rel="noreferrer"
        >
          Open source · Apache-2.0
        </a>
      </header>

      <section className="mt-16">
        <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
          Onboard to any codebase <span className="text-accent">in minutes</span>, not weeks.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Paste a public repo URL. <b className="text-fg">Graphify</b> parses the code into a knowledge graph
          (no LLM, no vector store), then <b className="text-fg">Gemma&nbsp;4</b> turns that graph into a
          guided tour, answers &ldquo;how does X reach Y?&rdquo; by traversing edges, and checks your whiteboard
          diagram against the real architecture.
        </p>

        <form
          className="mt-8 flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) start(url.trim());
          }}
        >
          <input
            className="input text-base"
            placeholder="https://github.com/owner/repo"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
            autoFocus
          />
          <button className="btn-primary whitespace-nowrap text-base" disabled={busy || !url.trim()}>
            {busy ? "Analyzing…" : "Analyze repo"}
          </button>
        </form>

        {(job || busy) && (
          <div className="card mt-6 p-4">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-accent" />
              </span>
              <div className="font-medium">{job ? STEPS[job.status] || job.status : "Starting…"}</div>
              {job?.stats?.nodes && (
                <span className="pill mono">
                  {job.stats.nodes} nodes · {job.stats.edges} edges · {job.stats.communities} communities
                </span>
              )}
            </div>
            <div className="mt-1 text-sm text-muted">{job?.message}</div>
            <ol className="mt-3 grid grid-cols-4 gap-2 text-xs">
              {["cloning", "extracting", "reporting", "ready"].map((s, i) => {
                const order = ["queued", "cloning", "extracting", "reporting", "ready"];
                const cur = order.indexOf(job?.status || "queued");
                const done = order.indexOf(s) <= cur;
                return (
                  <li
                    key={s}
                    className={`rounded-md border px-2 py-1.5 ${done ? "border-accent/60 text-fg" : "border-border text-muted"}`}
                  >
                    {i + 1}. {STEPS[s]}
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {error && (
          <div className="card mt-6 border-bad/50 p-4 text-sm">
            <div className="font-medium text-bad">Analysis failed</div>
            <div className="mt-1 text-muted">{error}</div>
          </div>
        )}
      </section>

      {repos.length > 0 && (
        <section className="mt-14">
          <h2 className="text-sm uppercase tracking-wider text-muted">Already mapped — open instantly</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {repos.map((r) => (
              <button
                key={r.id}
                onClick={() => router.push(`/r/${r.id}`)}
                className="card group p-4 text-left transition hover:border-accent/60"
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium group-hover:text-accent">{r.name}</div>
                  {r.has_tour && <span className="pill">tour cached</span>}
                </div>
                <div className="mono mt-2 text-xs text-muted">
                  {r.stats.nodes ?? "?"} nodes · {r.stats.edges ?? "?"} edges · {r.stats.communities ?? "?"} communities
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="mt-16 grid gap-4 md:grid-cols-3">
        {[
          ["1 · Graph", "Graphify (tree-sitter AST) extracts every function, class, import and call. Leiden clustering finds subsystems; the most connected symbols become god nodes."],
          ["2 · Tour", "Gemma 4 reads the graph (never raw files) and writes an architecture summary, start-here list, reading path and onboarding doc."],
          ["3 · Verify", "Ask structural questions answered by graph traversal with file:line evidence, or upload a whiteboard photo and let Gemma 4 flag drift."],
        ].map(([t, d]) => (
          <div key={t} className="card p-4">
            <div className="font-medium text-accent">{t}</div>
            <p className="mt-1 text-sm text-muted">{d}</p>
          </div>
        ))}
      </section>

      <footer className="mt-16 text-xs text-muted">
        Open-weight model: <span className="mono">gemma-4-26b-a4b-it</span> via the Gemini API · Graph layer:{" "}
        <span className="mono">graphifyy</span> (Apache-2.0) · Hosted on Cloudways + DigitalOcean
      </footer>
    </main>
  );
}
