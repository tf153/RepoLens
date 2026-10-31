"use client";

import type { ReactNode } from "react";

/* ---------------- numbered action stream (editorial: numerals, not icons) ---------------- */
export type StepState = "done" | "active" | "pending" | "error";
export interface Step {
  label: string;
  detail?: string;
  state: StepState;
}

export function ActionStream({ steps, compact = false }: { steps: Step[]; compact?: boolean }) {
  return (
    <ol>
      {steps.map((s, i) => (
        <li
          key={i}
          className={`row grid grid-cols-[44px_1fr_auto] items-baseline gap-4 ${compact ? "py-2" : "py-3"} ${
            s.state === "pending" ? "text-ink-4" : s.state === "error" ? "text-bad" : "text-ink"
          }`}
        >
          <span className="mono text-[11px] tracking-wider">{String(i + 1).padStart(2, "0")}</span>
          <div className="min-w-0">
            <div className={`text-[14px] ${s.state === "active" ? "font-medium" : ""}`}>
              {s.label}
              {s.state === "active" && <span className="blink ml-1 text-accent">▍</span>}
            </div>
            {s.detail && !compact && <div className="mt-0.5 text-[12.5px] text-ink-3">{s.detail}</div>}
          </div>
          <span className="micro">
            {s.state === "done" ? (
              <span className="text-ink">done</span>
            ) : s.state === "active" ? (
              <span className="flex items-center gap-1.5 text-accent">
                <span className="dot dot-accent pulse" /> running
              </span>
            ) : s.state === "error" ? (
              "failed"
            ) : (
              "queued"
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ---------------- big numeral (drift score etc.) ---------------- */
export function BigNumber({ value, label, suffix = "", tone }: { value: number | string | null; label: string; suffix?: string; tone?: "ok" | "warn" | "bad" }) {
  const color = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-ink";
  return (
    <div>
      <div className={`display num leading-none ${color}`} style={{ fontSize: "clamp(64px, 8vw, 112px)" }}>
        {value ?? "—"}
        {value !== null && suffix && <span className="text-[0.3em] text-ink-3">{suffix}</span>}
      </div>
      <div className="micro mt-2">{label}</div>
    </div>
  );
}

/* ---------------- thin ink bar ---------------- */
export function Bar({ value, max, className = "" }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.max(3, Math.round((value / max) * 100)) : 0;
  return (
    <div className={`h-px w-full bg-rule ${className}`}>
      <div className="h-px bg-ink" style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ---------------- provenance: EXTRACTED = filled dot, INFERRED = outlined ---------------- */
export function Prov({ confidence, label = true }: { confidence: string; label?: boolean }) {
  const filled = confidence === "EXTRACTED";
  return (
    <span className="inline-flex items-center gap-1.5 align-middle" title={filled ? "explicit in source" : "resolved by Graphify"}>
      <span className={`dot ${filled ? "dot-filled" : ""}`} />
      {label && <span className="mono text-[10px] tracking-wider text-ink-3">{confidence}</span>}
    </span>
  );
}

/* ---------------- section header: "01 / Title" ---------------- */
export function Section({ index, title, right, children, className = "" }: { index?: string; title: ReactNode; right?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="rule-ink" />
      <div className="flex items-baseline justify-between gap-4 py-3">
        <h3 className="flex items-baseline gap-3 text-[15px] font-medium">
          {index && <span className="mono text-[11px] tracking-wider text-ink-3">{index}</span>}
          {title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

/* ---------------- inline `code` rendering for model prose ---------------- */
export function Inline({ text, className = "" }: { text: string; className?: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.startsWith("`") && p.endsWith("`") ? (
          <code key={i} className="mono rounded-[3px] bg-paper-2 px-1 text-[0.72em] font-medium text-ink">
            {p.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="shimmer h-3" style={{ width: `${92 - (i % 3) * 20}%` }} />
      ))}
    </div>
  );
}

export function ModelTag({ online, model, provider }: { online: boolean; model: string; provider?: string }) {
  const via = provider && provider !== "gemini" ? ` · via ${provider}` : "";
  return (
    <span
      className={`tag ${online ? "tag-ink" : "tag-warn"}`}
      title={online ? `${model} connected${via}` : "No model API key — graph-only fallback"}
    >
      <span className={`dot ${online ? "dot-accent" : ""}`} style={!online ? { borderColor: "var(--warn)" } : undefined} />
      <span className="mono">{model}</span>
      {via && <span className="opacity-70">{via}</span>}
      {!online && <span>offline</span>}
    </span>
  );
}

export function Marquee({ items }: { items: string[] }) {
  const line = [...items, ...items];
  return (
    <div className="overflow-hidden border-y border-rule py-2.5">
      <div className="marquee">
        {line.map((t, i) => (
          <span key={i} className="micro flex items-center whitespace-nowrap px-6 !text-ink-2">
            {t}
            <span className="ml-12 h-1 w-1 rounded-full bg-accent" />
          </span>
        ))}
      </div>
    </div>
  );
}
