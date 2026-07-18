import { cn } from "@/lib/utils";

// Flat pastel fills for hero blocks. Pink is deliberately excluded — the
// pink Play/Like buttons live inside heroes and would vanish on a pink fill.
const FILLS = [
  "bg-pastel-yellow",
  "bg-pastel-mint",
  "bg-pastel-sky",
  "bg-pastel-lavender",
  "bg-pastel-red",
] as const;

function hashSeed(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 33) ^ seed.charCodeAt(i);
  }
  return Math.abs(h);
}

function Sparkle({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 1c.8 5.4 2.8 7.4 8.2 8.2-5.4.8-7.4 2.8-8.2 8.2-.8-5.4-2.8-7.4-8.2-8.2C9.2 8.4 11.2 6.4 12 1z" />
    </svg>
  );
}

/**
 * The page hero as a giant flat pastel block — the soft-brutalist replacement
 * for the old blurred-artwork backdrop. The fill is a deterministic "signature
 * color" derived from `seed` (album/artist/playlist title), decorated with
 * flat geometric shapes. In normal flow (not fixed), so it can never bleed
 * over the sidebar; text inside should use text-ink / text-ink/70.
 */
export function HeroCard({
  seed,
  className,
  innerClassName,
  children,
}: {
  seed: string;
  className?: string;
  innerClassName?: string;
  children: React.ReactNode;
}) {
  const fill = FILLS[hashSeed(seed) % FILLS.length];
  return (
    <header
      className={cn(
        "relative overflow-hidden rounded-3xl p-5 text-ink md:p-6",
        fill,
        className,
      )}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -right-20 -top-24 size-72 rounded-full bg-ink/10" />
        <div className="absolute -bottom-10 right-24 size-24 rounded-full bg-white/25" />
        <Sparkle className="absolute right-16 top-8 h-8 w-8 text-ink/20" />
        <Sparkle className="absolute bottom-6 right-44 h-4 w-4 text-white/60" />
      </div>
      <div className={cn("relative", innerClassName)}>{children}</div>
    </header>
  );
}
