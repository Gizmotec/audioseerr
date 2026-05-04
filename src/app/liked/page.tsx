import { ArrowLeft, Disc3, Heart, User } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAllLikes, type LikedRow } from "@/lib/likes";
import { isSetupComplete } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function LikedPage() {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login");
  }

  const likes = await getAllLikes(userId);
  const albums = likes.filter((l) => l.targetType === "ALBUM");
  const artists = likes.filter((l) => l.targetType === "ARTIST");
  const tracks = likes.filter((l) => l.targetType === "TRACK");

  const isEmpty = likes.length === 0;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-6">
      <Link
        href="/home"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      <header className="mt-4 mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Liked</h1>
        <p className="text-sm text-muted-foreground">
          Albums, artists, and tracks you&apos;ve hearted across Audioseerr.
        </p>
      </header>

      {isEmpty && (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Heart className="mx-auto mb-3 h-6 w-6 text-rose-400/60" />
          <p>Nothing here yet.</p>
          <p className="mt-1">
            Tap the heart on an album, artist, or track to save it for later.
          </p>
        </div>
      )}

      {albums.length > 0 && (
        <section className="mb-12 space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Albums{" "}
            <span className="text-muted-foreground/60">({albums.length})</span>
          </h2>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {albums.map((row) => (
              <li key={row.id}>
                <LikedAlbumTile row={row} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {artists.length > 0 && (
        <section className="mb-12 space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Artists{" "}
            <span className="text-muted-foreground/60">({artists.length})</span>
          </h2>
          <ul className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {artists.map((row) => (
              <li key={row.id}>
                <LikedArtistTile row={row} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {tracks.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Tracks{" "}
            <span className="text-muted-foreground/60">({tracks.length})</span>
          </h2>
          <ol className="divide-y divide-border/50">
            {tracks.map((row) => (
              <LikedTrackRow key={row.id} row={row} />
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}

function LikedAlbumTile({ row }: { row: LikedRow }) {
  return (
    <Link
      href={`/album/${row.targetId}`}
      className="group flex flex-col gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative aspect-square overflow-hidden rounded-md bg-secondary">
        {row.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.coverUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            <Disc3 className="h-1/3 w-1/3" />
          </div>
        )}
      </div>
      <div className="space-y-0.5">
        <p className="truncate text-sm font-medium leading-snug" title={row.title}>
          {row.title}
        </p>
        {row.artistName && (
          <p
            className="truncate text-xs text-muted-foreground"
            title={row.artistName}
          >
            {row.artistName}
          </p>
        )}
      </div>
    </Link>
  );
}

function LikedArtistTile({ row }: { row: LikedRow }) {
  return (
    <Link
      href={`/artist/${row.targetId}`}
      className="group flex flex-col items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-full bg-secondary">
        {row.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.coverUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            <User className="h-1/3 w-1/3" />
          </div>
        )}
      </div>
      <p className="w-full truncate text-center text-xs" title={row.title}>
        {row.title}
      </p>
    </Link>
  );
}

function LikedTrackRow({ row }: { row: LikedRow }) {
  // Liked tracks always carry their album context (set when the like was
  // created on the album page), so we always have a target to link to.
  const href = row.albumMbid ? `/album/${row.albumMbid}` : null;
  const inner = (
    <div className="flex items-center gap-3 py-2.5">
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-secondary">
        {row.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.coverUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            <Disc3 className="h-1/2 w-1/2" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm" title={row.title}>
          {row.title}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {[row.artistName, row.albumTitle].filter(Boolean).join(" · ")}
        </p>
      </div>
    </div>
  );

  return (
    <li>
      {href ? (
        <Link
          href={href}
          className="block rounded-md outline-none hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {inner}
        </Link>
      ) : (
        inner
      )}
    </li>
  );
}
