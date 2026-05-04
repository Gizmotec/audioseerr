import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DiscoveryRow } from "@/components/DiscoveryRow";
import { buildLibraryIndex } from "@/lib/library";
import { isSetupComplete } from "@/lib/settings";
import { getDeezerChartAlbums } from "@/lib/deezer";
import { SearchBar } from "@/app/search/SearchBar";

export const dynamic = "force-dynamic";

// Two seed genres for the home rows. Browse-by-genre chips below cover the
// long tail. We could rotate or personalise these in v2.
const HOME_TAGS = ["pop", "rock", "electronic"];
const GENRE_CHIPS = [
  "rock",
  "pop",
  "indie",
  "electronic",
  "hip-hop",
  "alternative",
  "jazz",
  "classical",
  "metal",
  "folk",
  "ambient",
  "soul",
];

export default async function HomePage() {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  // Deezer's chart endpoint is keyless and reflects current play activity, so
  // recent releases actually surface here. (Earlier versions used Last.fm's
  // all-time tag chart, which is why a 2014 album was showing as "trending".)
  const settled = await Promise.all(
    HOME_TAGS.map(async (tag) => {
      try {
        return { tag, albums: await getDeezerChartAlbums(tag, 12) };
      } catch {
        return { tag, albums: [] };
      }
    }),
  );
  const rows = settled.filter((r) => r.albums.length > 0);

  const library = await buildLibraryIndex();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-10 md:px-6">
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Find an album</h2>
        <SearchBar initialQuery="" />
      </section>

      {rows.map((r) => (
        <DiscoveryRow
          key={r.tag}
          title={`Trending in ${r.tag}`}
          href={`/genre/${encodeURIComponent(r.tag)}`}
          albums={r.albums}
          library={library}
        />
      ))}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Browse by genre</h2>
        <ul className="flex flex-wrap gap-2">
          {GENRE_CHIPS.map((g) => (
            <li key={g}>
              <Link
                href={`/genre/${encodeURIComponent(g)}`}
                className="inline-flex rounded-full border border-border bg-secondary/40 px-3 py-1 text-sm capitalize hover:border-foreground hover:bg-secondary"
              >
                {g}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
