import Link from "next/link";
import {
  type DiscoveryAlbum,
  DiscoveryAlbumCard,
} from "@/components/DiscoveryAlbumCard";
import type { LibraryIndex } from "@/lib/library";

export function DiscoveryRow({
  title,
  href,
  albums,
  library,
}: {
  title: string;
  href?: string;
  albums: DiscoveryAlbum[];
  library?: LibraryIndex;
}) {
  if (albums.length === 0) return null;

  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium">{title}</h2>
        {href && (
          <Link
            href={href}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            See all →
          </Link>
        )}
      </header>
      <div className="-mx-4 overflow-x-auto px-4 md:-mx-6 md:px-6">
        <ul className="flex gap-4 pb-2">
          {albums.map((a, i) => (
            <li key={`${a.mbid ?? i}-${a.title}`} className="w-36 shrink-0 sm:w-40">
              <DiscoveryAlbumCard
                album={a}
                libraryHit={library?.lookup(a) ?? null}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
