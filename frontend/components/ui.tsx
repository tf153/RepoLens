"use client";

import { Check, Loader2, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/* ---------------- Agent action stream: named steps instead of a spinner ---------------- */
export type StepState = "done" | "active" | "pending" | "error";

export interface Step {
  label: string;
  detail?: string;
  state: StepState;
  icon?: LucideIcon;
}

export function ActionStream({ steps, compact = false }: { steps: Step[]; compact?: boolean }) {
  return (
    <ol className={`relative ${compact ? "space-y-2" : "space-y-3"}`}>
      {steps.map((s, i) => {
        const Icon = s.icon;
        const last = i === steps.length - 1;
        return (
          <li key={i} className="relative flex gap-3">
            {!last && (
              <span
                className={`absolute left-[11px] top-6 h-[calc(100%-6px)] w-px ${
                  s.state === "done" ? "bg-gradient-to-b from-violet to-cyan" : "bg-line"
                }`}
              />
            )}
            <span
              className={`relative z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                s.state === "done"
                  ? "border-transparent grad-bg text-white"
                  : s.state === "active"
                    ? "border-accent/60 bg-bg text-accent dot-live"
                    : s.state === "error"
                      ? "border-bad/60 bg-bad/10 text-bad"
                      : "border-line bg-bg text-muted-2"
              }`}
            >
              {s.state === "done" ? (
                <Check size={13} strokeWidth={3} />
              ) : s.state === "active" ? (
                <Loader2 size={13} className="spin" />
              ) : Icon ? (
                <Icon size={12} />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
              )}
            </span>
            <div className="min-w-0 pt-0.5">
              <div
                className={`text-sm ${
                  s.state === "pending" ? "text-muted-2" : s.state === "error" ? "text-bad" : "text-fg"
                } ${s.state === "active" ? "font-medium" : ""}`}
              >
                {s.label}
                {s.state === "active" && <span className="blink ml-1 text-accent">▍</span>}
              </div>
              {s.detail && !compact && <div className="mt-0.5 text-xs text-muted">{s.detail}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------- Circular gauge (drift score) ---------------- */
export function Gauge({ value, label, size = 112 }: { value: number | null; label: string; size?: number }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value ?? 0));
  const color = value === null ? "var(--muted)" : v < 25 ? "var(--ok)" : v < 60 ? "var(--warn)" : "var(--bad)";
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.08)" strokeWidth="8" fill="none" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - (c * v) / 100}
            style={{ transition: "stroke-dashoffset .8s cubic-bezier(.2,.7,.2,1)", filter: `drop-shadow(0 0 8px ${color})` }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-2xl font-semibold" style={{ color }}>
          {value ?? "—"}
        </div>
      </div>
      <div className="eyebrow text-center">{label}</div>
    </div>
  );
}

/* ---------------- Misc ---------------- */
export function Bar({ value, max, className = "" }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className={`h-1 w-full overflow-hidden rounded-full bg-white/5 ${className}`}>
      <div className="h-full rounded-full grad-bg" style={{ width: `${pct}%`, opacity: 0.85 }} />
    </div>
  );
}

export function ConfidencePill({ confidence }: { confidence: string }) {
  const cls = confidence === "EXTRACTED" ? "pill-ok" : confidence === "INFERRED" ? "pill-warn" : "pill-bad";
  return <span className={`pill mono ${cls} !px-1.5 !py-0 text-[10px]`}>{confidence}</span>;
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="shimmer h-3.5" style={{ width: `${90 - (i % 3) * 18}%` }} />
      ))}
    </div>
  );
}

export function SectionTitle({ icon: Icon, children, right }: { icon?: LucideIcon; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold">
        {Icon && (
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-violet/15 text-accent-2">
            <Icon size={14} />
          </span>
        )}
        {children}
      </h3>
      {right}
    </div>
  );
}

export function GemmaBadge({ online, model }: { online: boolean; model: string }) {
  return (
    <span className={`pill ${online ? "pill-violet" : "pill-warn"}`} title={online ? "Gemma 4 connected" : "No GEMINI_API_KEY: graph-only fallback"}>
      <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-accent-2 dot-live" : "bg-warn"}`} />
      <span className="mono">{model}</span>
      {!online && <span>offline</span>}
    </span>
  );
}
