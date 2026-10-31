import Link from "next/link";

export default function Logo({ small = false }: { small?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2 select-none">
      <svg width={small ? 26 : 34} height={small ? 26 : 34} viewBox="0 0 34 34" fill="none" aria-hidden>
        <circle cx="17" cy="17" r="15" stroke="var(--accent)" strokeWidth="2" />
        <circle cx="17" cy="17" r="6" fill="var(--accent-2)" />
        <circle cx="7" cy="12" r="2.2" fill="var(--accent)" />
        <circle cx="27" cy="10" r="2.2" fill="var(--accent)" />
        <circle cx="25" cy="26" r="2.2" fill="var(--accent)" />
        <path d="M9 13 L13 15 M25 11 L21 14 M23 25 L20 21" stroke="var(--accent)" strokeWidth="1.5" />
      </svg>
      <span className={`font-semibold tracking-tight ${small ? "text-lg" : "text-2xl"}`}>
        Repo<span className="text-accent">Lens</span>
      </span>
    </Link>
  );
}
