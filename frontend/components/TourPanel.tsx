"use client";

import { useEffect, useState } from "react";
import { ArrowDown, Download, RefreshCw } from "lucide-react";
import Markdown from "./Markdown";
import { ActionStream, Inline, Section, type Step } from "./ui";
import { api, type Tour } from "@/lib/api";

const LOADING: Step[] = [
  { label: "Collect graph evidence", detail: "god nodes · Leiden communities · surprising cross-community edges · README", state: "done" },
  { label: "Gemma 4 reads the graph", detail: "names subsystems, picks start-here symbols, writes the reading path", state: "active" },
  { label: "Write names back to Graphify", detail: ".graphify_labels.json → re-render graph.html", state: "pending" },
];

export default function TourPanel({ repoId, onRelabelled }: { repoId: string; onRelabelled?: () => void }) {
  const [tour, setTour] = useState<Tour | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDoc, setShowDoc] = useState(false);

  async function load(refresh = false) {
    setLoading(true);
    setError(null);
    try {
      const t = await api.tour(repoId, refresh);
      setTour(t);
      if (t.graph_html_relabelled) onRelabelled?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoId]);

  if (loading && !tour) {
    return (
      <div className="rise">
        <div className="flex items-baseline justify-between py-3">
          <span className="micro !text-ink">Generating the tour</span>
          <span className="micro !text-accent">Gemma 4</span>
        </div>
        <ActionStream steps={LOADING} />
      </div>
    );
  }
  if (error) return <p className="py-6 text-bad">{error}</p>;
  if (!tour) return null;

  const fallback = tour.model.includes("fallback");

  return (
    <div className="space-y-14">
      {/* architecture — pull quote */}
      <section className="rise">
        <div className="flex items-baseline justify-between pb-4">
          <span className="micro">01 / Architecture</span>
          <div className="flex items-center gap-4">
            <span className={`tag ${fallback ? "tag-warn" : "tag-ink"} mono`}>{tour.model}</span>
            <button className="micro ulink flex items-center gap-1.5 hover:text-ink" onClick={() => load(true)} disabled={loading}>
              <RefreshCw size={11} className={loading ? "pulse" : ""} /> Regenerate
            </button>
          </div>
        </div>
        <p className="display display-md !leading-[1.15] max-w-4xl"><Inline text={tour.architecture_summary} /></p>
        {tour.parse_warning && <p className="mt-3 text-xs text-warn">{tour.parse_warning}</p>}
      </section>

      {/* start here */}
      <Section index="02" title="Start reading here" right={<span className="micro">ordered for a first read</span>} className="rise rise-1">
        <ol>
          {tour.start_here?.map((s, i) => (
            <li key={i} className="lrow grid-cols-[44px_1fr] md:grid-cols-[44px_minmax(0,1.1fr)_minmax(0,1.4fr)]">
              <span className="num text-[22px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
              <div className="min-w-0">
                <div className="text-[18px] font-medium tracking-tight">{s.node}</div>
                <div className="mono mt-0.5 text-[11.5px] text-accent">{s.file}</div>
              </div>
              <div className="text-[14px] leading-snug text-ink-2 md:pt-1"><Inline text={s.why} /></div>
            </li>
          ))}
        </ol>
      </Section>

      <div className="grid gap-10 md:grid-cols-2">
        {/* subsystems */}
        <Section index="03" title="Subsystems" right={<span className="micro">Leiden · named by Gemma 4</span>} className="rise rise-2">
          <ul>
            {tour.subsystems?.slice(0, 12).map((s) => (
              <li key={s.community} className="row py-2.5">
                <div className="flex items-baseline gap-3">
                  <span className="mono text-[10px] text-ink-4">C{s.community}</span>
                  <span className="text-[15px] font-medium">{s.label}</span>
                </div>
                <div className="ml-[34px] text-[13px] text-ink-2"><Inline text={s.role} /></div>
              </li>
            ))}
          </ul>
        </Section>

        {/* reading path */}
        <Section index="04" title="Reading path" className="rise rise-3">
          <ol>
            {(tour.reading_path || []).map((r, i) => (
              <li key={r.step} className="row grid grid-cols-[32px_1fr] gap-3 py-2.5">
                <span className="mono text-[11px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0">
                  <div className="mono truncate text-[12.5px] text-ink">{r.file}</div>
                  <div className="text-[13px] text-ink-2"><Inline text={r.what_to_look_for} /></div>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      {/* gotchas */}
      <Section index="05" title="Gotchas" className="rise rise-3">
        <ul className="grid gap-x-10 md:grid-cols-2">
          {(tour.gotchas || []).map((g, i) => (
            <li key={i} className="row flex gap-3 py-3 text-[14px] leading-snug text-ink-2">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <Inline text={g} />
            </li>
          ))}
          {!tour.gotchas?.length && <li className="row py-3 text-sm text-ink-3">None flagged.</li>}
        </ul>
      </Section>

      {/* onboarding doc */}
      <Section
        index="06"
        title="ONBOARDING.md"
        className="rise rise-4"
        right={
          <div className="flex items-center gap-5">
            <button
              className="micro ulink flex items-center gap-1.5 hover:text-ink"
              onClick={() => {
                const blob = new Blob([tour.onboarding_md || ""], { type: "text/markdown" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = "ONBOARDING.md";
                a.click();
              }}
            >
              <Download size={11} /> Download
            </button>
            <button className="micro ulink flex items-center gap-1.5 hover:text-ink" onClick={() => setShowDoc((v) => !v)}>
              {showDoc ? "Collapse" : "Expand"} <ArrowDown size={11} className={`transition ${showDoc ? "rotate-180" : ""}`} />
            </button>
          </div>
        }
      >
        {showDoc ? (
          <div className="frame max-w-3xl p-6 md:p-8">
            <Markdown>{tour.onboarding_md || ""}</Markdown>
          </div>
        ) : (
          <p className="text-[14px] text-ink-3">A complete onboarding document generated from the graph. Expand to read, or download the markdown.</p>
        )}
      </Section>
    </div>
  );
}
