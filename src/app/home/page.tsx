import { Inbox, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { DiscoveryRow } from "@/components/DiscoveryRow";
import { buildLibraryIndex } from "@/lib/library";
import { getSettings, isSetupComplete } from "@/lib/settings";
import { getTopAlbumsByTag } from "@/lib/lastfm";
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

  const role = (session.user as { role?: string }).role;
  const settings = await getSettings();
  const lastFmKey = settings.lastFmApiKey;

  let rows: { tag: string; albums: Awaited<ReturnType<typeof getTopAlbumsByTag>> }[] =
    [];
  if (lastFmKey) {
    const settled = await Promise.all(
      HOME_TAGS.map(async (tag) => {
        try {
          return { tag, albums: await getTopAlbumsByTag({ apiKey: lastFmKey }, tag, 12) };
        } catch {
          return { tag, albums: [] };
        }
      }),
    );
    rows = settled.filter((r) => r.albums.length > 0);
  }

  const library = await buildLibraryIndex();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-10 md:px-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audioseerr</h1>
          <p className="text-xs text-muted-foreground">
            Signed in as <span className="font-mono">{session.user.name}</span>
            {role === "ADMIN" ? " · admin" : ""}
          </p>
        </div>
        <nav className="flex items-center gap-1">
          <Link
            href="/requests"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Inbox className="h-4 w-4" /> My requests
          </Link>
          {role === "ADMIN" && (
            <Link
              href="/admin/requests"
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <ShieldCheck className="h-4 w-4" /> Queue
            </Link>
          )}
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button variant="ghost" size="sm" type="submit">
              Sign out
            </Button>
          </form>
        </nav>
      </header>

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

      {!lastFmKey && (
        <section className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          Add a Last.fm API key in setup to unlock charts and genre browsing.
          Without it, search is the only entry point.
        </section>
      )}

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
