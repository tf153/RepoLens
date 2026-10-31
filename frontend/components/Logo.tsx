import Link from "next/link";

export default function Logo({ small = false }: { small?: boolean }) {
  const s = small ? 28 : 36;
  return (
    <Link href="/" className="group flex select-none items-center gap-2.5">
      <span
        className="relative flex items-center justify-center rounded-xl grad-bg"
        style={{ width: s, height: s, boxShadow: "0 6px 20px -8px rgba(139,92,246,.9)" }}
      >
        <svg width={s * 0.62} height={s * 0.62} viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="3.2" fill="white" />
          <circle cx="4.5" cy="7" r="1.8" fill="white" opacity=".9" />
          <circle cx="19.5" cy="6" r="1.8" fill="white" opacity=".9" />
          <circle cx="18" cy="18.5" r="1.8" fill="white" opacity=".9" />
          <circle cx="6" cy="18" r="1.8" fill="white" opacity=".9" />
          <path d="M6 8l3.6 2.4M18 7.2l-3.6 2.6M16.6 17.2l-2.6-3M7.4 16.8l2.6-2.8" stroke="white" strokeWidth="1.4" strokeLinecap="round" opacity=".85" />
        </svg>
      </span>
      <span className={`font-semibold tracking-tight ${small ? "text-[17px]" : "text-[22px]"}`}>
        Repo<span className="grad-text">Lens</span>
      </span>
    </Link>
  );
}
