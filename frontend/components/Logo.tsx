import Link from "next/link";

export default function Logo({ small = false }: { small?: boolean }) {
  return (
    <Link href="/" className="group flex select-none items-baseline gap-2">
      <span
        className={`inline-block rounded-[2px] bg-ink transition group-hover:bg-accent ${small ? "h-[10px] w-[10px]" : "h-3 w-3"}`}
        style={{ transform: "translateY(-1px)" }}
      />
      <span className={`font-medium tracking-[-0.02em] ${small ? "text-[15px]" : "text-[18px]"}`}>
        RepoLens<span className="text-accent">.</span>
      </span>
    </Link>
  );
}
