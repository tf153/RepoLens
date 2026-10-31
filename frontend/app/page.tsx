"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import Logo from "@/components/Logo";
import { ActionStream, Marquee, type Step } from "@/components/ui";
import { api, type Job, type RepoListItem } from "@/lib/api";

const ORDER = ["queued", "cloning", "extracting", "reporting", "ready"];
const EXAMPLES = ["encode/starlette", "pallets/flask", "tiangolo/fastapi"];
const TICKER = [
  "Graphify · tree-sitter AST",
  "Leiden communities",
  "God nodes",
  "Gemma 4 · open weights",
  "EXTRACTED / INFERRED provenance",
  "No vector store",
  "Diagram drift check",
  "/repolens agent skill",
  "Apache-2.0",
];

function pipelineSteps(job: Job | null, busy: boolean): Step[] {
  const cur = job ? ORDER.indexOf(job.status) : busy ? 0 : -1;
  const err = job?.status === "error";
  const mk = (idx: number, label: string, detail: string): Step => ({
    label,
    detail,
    state: err && idx === cur ? "error" : idx < cur ? "done" : idx === cur ? "active" : "pending",
  });
  return [
    mk(1, "Clone repository", "git clone --depth 1 — public repositories only"),
    mk(2, "Parse the AST into a knowledge graph", job?.stats?.nodes ? `${job.stats.nodes.toLocaleString()} nodes · ${job.stats.edges?.toLocaleString()} edges` : "Graphify, deterministic, no model involved"),
    mk(3, "Cluster subsystems, rank god nodes", job?.stats?.communities ? `${job.stats.communities} Leiden communities` : "GRAPH_REPORT.md and the interactive graph"),
    { label: "Open the tour", state: cur >= 4 ? "done" : "pending" },
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
    <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-6 md:px-10">
      {/* rail */}
      <header className="flex items-center justify-between py-5">
        <Logo />
        <nav className="micro flex items-center gap-7">
          <span className="hidden items-center gap-2 sm:flex">
            <span className="dot dot-accent" /> Gemma 4 · Graphify
          </span>
          <a className="ulink" href="https://github.com/tf153/RepoLens/blob/main/skills/repolens/SKILL.md" target="_blank" rel="noreferrer">
            Skill
          </a>
          <a className="ulink" href="https://github.com/tf153/RepoLens" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
      </header>
      <div className="rule-ink" />

      {/* hero */}
      <section className="grid gap-10 pb-16 pt-14 md:grid-cols-12 md:pt-20">
        <div className="md:col-span-8">
          <div className="micro rise">Codebase onboarding — open-source, open-weight</div>
          <h1 className="display display-xl rise rise-1 mt-5">
            Read any codebase
            <br />
            like you <span className="italic">wrote</span> it.
          </h1>
        </div>
        <div className="flex flex-col justify-end md:col-span-4">
          <p className="lede rise rise-2">
            Paste a public repository. Graphify maps it into a knowledge graph — no model, no vector store. Gemma 4 reads
            the graph and hands you a guided tour, answers &ldquo;how does X reach Y?&rdquo; by walking edges, and checks
            your whiteboard against the real architecture.
          </p>
          <dl className="rise rise-3 mt-8 grid grid-cols-3 gap-4">
            {[
              ["Graph", "Graphify"],
              ["Model", "gemma-4-26b-a4b-it"],
              ["Host", "Cloudways · DO"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="micro">{k}</dt>
                <dd className="mono mt-1 truncate text-[12px] text-ink-2">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* input */}
      <section className="rise rise-3">
        <div className="rule-ink" />
        <form
          className="grid items-end gap-4 py-6 md:grid-cols-12"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) start(url.trim());
          }}
        >
          <div className="md:col-span-9">
            <label className="micro">Repository URL</label>
            <input
              className="field display mt-2 !text-[clamp(22px,2.6vw,36px)] !font-light"
              placeholder="https://github.com/owner/repo"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={busy}
              autoFocus
            />
          </div>
          <div className="flex items-center justify-between gap-4 md:col-span-3 md:justify-end">
            <button className="btn btn-ink w-full md:w-auto" disabled={busy || !url.trim()}>
              {busy ? "Mapping" : "Map it"} <ArrowRight size={15} />
            </button>
          </div>
        </form>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-6">
          <span className="micro">Try</span>
          {EXAMPLES.map((ex) => (
            <button key={ex} className="ulink mono text-[12.5px] text-ink-2 hover:text-ink" disabled={busy} onClick={() => start(`https://github.com/${ex}`)}>
              {ex}
            </button>
          ))}
        </div>

        {(job || busy || error) && (
          <div className="rise pb-10">
            <div className="flex items-baseline justify-between py-3">
              <span className="micro !text-ink">Pipeline {job?.name && <span className="mono ml-2 normal-case tracking-normal text-ink-3">{job.name}</span>}</span>
              <span className={`micro ${error ? "!text-bad" : "!text-accent"}`}>{error ? "failed" : job?.status || "starting"}</span>
            </div>
            <ActionStream steps={pipelineSteps(job, busy)} />
            {job?.message && !error && <div className="mono mt-3 text-[12px] text-ink-3">{job.message}</div>}
            {error && <div className="mt-3 text-[14px] text-bad">{error}</div>}
          </div>
        )}
      </section>

      <Marquee items={TICKER} />

      {/* already mapped — index table */}
      {repos.length > 0 && (
        <section className="pt-16">
          <div className="flex items-end justify-between pb-4">
            <div>
              <div className="micro">Index</div>
              <h2 className="display display-md mt-2">Already mapped</h2>
            </div>
            <span className="micro">{repos.length} repositories · open instantly</span>
          </div>
          <div className="hidden grid-cols-[48px_1fr_140px_140px_140px_40px] gap-4 pb-2 md:grid">
            {["No.", "Repository", "Nodes", "Edges", "Subsystems", ""].map((h) => (
              <span key={h} className="micro">
                {h}
              </span>
            ))}
          </div>
          <div>
            {repos.map((r, i) => (
              <button
                key={r.id}
                onClick={() => router.push(`/r/${r.id}`)}
                className="lrow lrow-hover w-full grid-cols-[48px_1fr_40px] px-1 text-left md:grid-cols-[48px_1fr_140px_140px_140px_40px]"
              >
                <span className="mono text-[11px] tracking-wider grey">{String(i + 1).padStart(2, "0")}</span>
                <span className="flex items-baseline gap-3">
                  <span className="text-[clamp(18px,1.8vw,26px)] font-light tracking-tight">{r.name}</span>
                  {r.has_tour && <span className="micro accent-on-hover !text-accent">tour cached</span>}
                </span>
                <span className="num hidden text-[20px] md:block">{r.stats.nodes?.toLocaleString() ?? "—"}</span>
                <span className="num hidden text-[20px] md:block">{r.stats.edges?.toLocaleString() ?? "—"}</span>
                <span className="num hidden text-[20px] md:block">{r.stats.communities ?? "—"}</span>
                <ArrowUpRight size={18} className="justify-self-end" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* how it works — three oversized numerals */}
      <section className="pt-20">
        <div className="micro">Method</div>
        <h2 className="display display-md mt-2 max-w-3xl">Graph first. Model second. Evidence always.</h2>
        <div className="mt-10 grid gap-10 md:grid-cols-3">
          {[
            {
              n: "01",
              t: "Build the graph",
              d: "Graphify parses every function, class, import and call with tree-sitter. Leiden clustering finds subsystems; the most connected symbols become god nodes. Deterministic, local, no model.",
              tag: "Graphify",
            },
            {
              n: "02",
              t: "Narrate it",
              d: "Gemma 4 is shown only graph evidence with file:line citations — god nodes, communities, surprising edges — and writes the architecture summary, start-here list and onboarding doc.",
              tag: "Gemma 4 · text",
            },
            {
              n: "03",
              t: "Verify against reality",
              d: "Ask structural questions answered by traversal, every hop marked EXTRACTED or INFERRED. Or upload a whiteboard photo and let Gemma 4 vision flag what drifted.",
              tag: "Gemma 4 · vision",
            },
          ].map(({ n, t, d, tag }, i) => (
            <div key={n} className={`rise rise-${i + 1}`}>
              <div className="rule-ink" />
              <div className="display num pt-4" style={{ fontSize: "clamp(64px, 6vw, 96px)" }}>
                {n}
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <h3 className="text-[18px] font-medium">{t}</h3>
                <span className="micro">{tag}</span>
              </div>
              <p className="mt-2 text-[14.5px] leading-[1.6] text-ink-2">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* skill */}
      <section className="mt-20 grid gap-6 border-y border-rule py-8 md:grid-cols-12">
        <div className="micro md:col-span-3">Also an agent skill</div>
        <div className="md:col-span-6">
          <p className="text-[18px] font-light leading-snug">
            Type <span className="mono text-[15px] text-accent">/repolens</span> in Cursor, Claude Code or Codex. It builds the
            graph, writes <span className="mono text-[15px]">ONBOARDING.md</span>, and answers structural questions with{" "}
            <span className="mono text-[15px]">graphify path · explain · query</span>.
          </p>
        </div>
        <div className="flex items-start md:col-span-3 md:justify-end">
          <a className="btn btn-line" href="https://github.com/tf153/RepoLens/tree/main/skills/repolens" target="_blank" rel="noreferrer">
            SKILL.md <ArrowUpRight size={15} />
          </a>
        </div>
      </section>

      <footer className="micro flex flex-col gap-2 py-8 md:flex-row md:items-center md:justify-between">
        <span>
          Open-weight model <span className="mono normal-case tracking-normal text-ink">gemma-4-26b-a4b-it</span> via the Gemini API · graph layer{" "}
          <span className="mono normal-case tracking-normal text-ink">graphifyy</span> (Apache-2.0)
        </span>
        <span>Hacktoberfest 2026 · Cloudways Velocity · DigitalOcean</span>
      </footer>
    </main>
  );
}
