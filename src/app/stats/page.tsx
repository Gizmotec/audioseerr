import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Clock,
  Disc3,
  Flame,
  MicVocal,
  Play,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { isSetupComplete } from "@/lib/settings";
import {
  longestStreak,
  playsByDay,
  topAlbums,
  topArtists,
  topTracks,
  totalMinutes,
  totalPlays,
  uniqueArtists,
  type PlayRow,
} from "@/lib/stats";

export const dynamic = "force-dynamic";

// Safety valve so a heavy scrobbler can't make this page read unbounded rows.
// Range-filtered queries take the most recent rows inside the range.
const HISTORY_CAP = 10_000;
const TOP_N = 10;
const ACTIVITY_DAYS = 14;

const RANGES = [
  { key: "4w", label: "4 weeks", days: 28 },
  { key: "6m", label: "6 months", days: 183 },
  { key: "all", label: "All time", days: null },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

function parseRange(value: string | undefined): RangeKey {
  return RANGES.some((r) => r.key === value) ? (value as RangeKey) : "4w";
}

// Outside the component so render stays pure (react-hooks/purity) — same
// pattern as home's formatRelativeTime helper.
function rangeStart(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login");
  }
  const params = await searchParams;
  const range = RANGES.find((r) => r.key === parseRange(params.range))!;

  const since = range.days === null ? null : rangeStart(range.days);
  const rows: PlayRow[] = await prisma.playHistory.findMany({
    where: {
      userId,
      ...(since ? { playedAt: { gte: since } } : {}),
    },
    orderBy: { playedAt: "desc" },
    take: HISTORY_CAP,
    select: {
      recordingMbid: true,
      albumMbid: true,
      artistName: true,
      title: true,
      durationMs: true,
      playedMs: true,
      playedAt: true,
    },
  });

  const artists = topArtists(rows, TOP_N);
  const tracks = topTracks(rows, TOP_N);
  const albums = topAlbums(rows, TOP_N);
  const activity = playsByDay(rows, ACTIVITY_DAYS);
  const streak = longestStreak(activity);
  const plays = totalPlays(rows);
  const minutes = totalMinutes(rows);
  const artistsHeard = uniqueArtists(rows);

  // PlayHistory has no album title — resolve display titles for the ranked
  // albums from the library index, falling back to downloaded-track metadata
  // for albums that dropped out of the index.
  const albumTitles = await resolveAlbumTitles(albums.map((a) => a.albumMbid));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 md:px-6">
      <header className="flex flex-col gap-5 border-b border-foreground/10 pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl space-y-2">
          <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
            <BarChart3 className="h-3.5 w-3.5" />
            Stats
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            Your listening
          </h1>
          <p className="text-sm leading-6 text-muted-foreground md:text-base">
            Your always-on recap — plays, minutes, and the artists and tracks
            you keep coming back to.
          </p>
        </div>
        <nav aria-label="Time range" className="flex flex-wrap gap-2">
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={`/stats?range=${r.key}`}
              aria-current={r.key === range.key ? "page" : undefined}
              className={
                r.key === range.key
                  ? "inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-pastel-pink/80"
                  : "inline-flex h-9 items-center rounded-full bg-card px-4 text-sm font-bold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
              }
            >
              {r.label}
            </Link>
          ))}
        </nav>
      </header>

      {plays === 0 ? (
        <EmptyStats rangeLabel={range.label.toLowerCase()} />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              icon={<Play className="h-4 w-4 text-muted-foreground" />}
              label="Plays"
              value={plays.toLocaleString()}
            />
            <StatCard
              icon={<Clock className="h-4 w-4 text-muted-foreground" />}
              label="Minutes"
              value={minutes.toLocaleString()}
            />
            <StatCard
              icon={<MicVocal className="h-4 w-4 text-muted-foreground" />}
              label="Unique artists"
              value={artistsHeard.toLocaleString()}
            />
            <StatCard
              icon={<CalendarDays className="h-4 w-4 text-muted-foreground" />}
              label="Longest streak"
              value={`${streak} ${streak === 1 ? "day" : "days"}`}
            />
          </section>

          <ActivityStrip activity={activity} />

          <section className="grid gap-8 lg:grid-cols-2">
            <RankedList
              title="Top tracks"
              items={tracks.map((t) => ({
                key: t.recordingMbid,
                primary: t.title,
                secondary: t.artistName,
                plays: t.plays,
              }))}
            />
            <RankedList
              title="Top artists"
              items={artists.map((a) => ({
                key: a.name,
                primary: a.name,
                plays: a.plays,
              }))}
            />
            <RankedList
              title="Top albums"
              items={albums.map((a) => ({
                key: a.albumMbid,
                primary: albumTitles.get(a.albumMbid) ?? "Unknown album",
                secondary: a.artistName,
                plays: a.plays,
              }))}
            />
          </section>
        </>
      )}
    </main>
  );
}

async function resolveAlbumTitles(mbids: string[]): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  if (mbids.length === 0) return titles;
  const [items, tracks] = await Promise.all([
    prisma.libraryItem.findMany({
      where: { mbid: { in: mbids } },
      select: { mbid: true, title: true },
    }),
    prisma.downloadedTrack.findMany({
      where: { albumMbid: { in: mbids }, albumTitle: { not: null } },
      select: { albumMbid: true, albumTitle: true },
      distinct: ["albumMbid"],
    }),
  ]);
  for (const t of tracks) {
    if (t.albumMbid && t.albumTitle) titles.set(t.albumMbid, t.albumTitle);
  }
  // Library index wins over denormalized track metadata.
  for (const item of items) {
    titles.set(item.mbid, item.title);
  }
  return titles;
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-card p-4">
      <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="text-3xl font-extrabold tracking-tight md:text-4xl">
        {value}
      </p>
    </div>
  );
}

function ActivityStrip({ activity }: { activity: { date: string; plays: number }[] }) {
  const max = Math.max(...activity.map((d) => d.plays), 1);
  return (
    <section className="space-y-3">
      <SectionHeader title={`Last ${activity.length} days`} />
      <div className="rounded-2xl bg-card p-4">
        <div className="flex h-20 items-end gap-1.5">
          {activity.map((day) => (
            <div
              key={day.date}
              className="flex flex-1 flex-col items-center gap-1"
              title={`${day.date}: ${day.plays} ${day.plays === 1 ? "play" : "plays"}`}
            >
              <div
                className={
                  day.plays > 0
                    ? "w-full rounded-sm bg-primary"
                    : "w-full rounded-sm bg-surface-2"
                }
                style={{
                  height: `${Math.max(6, Math.round((day.plays / max) * 100))}%`,
                }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <span>{activity[0]?.date.slice(5)}</span>
          <span>{activity[activity.length - 1]?.date.slice(5)}</span>
        </div>
      </div>
    </section>
  );
}

function RankedList({
  title,
  items,
}: {
  title: string;
  items: { key: string; primary: string; secondary?: string; plays: number }[];
}) {
  const max = Math.max(...items.map((i) => i.plays), 1);
  return (
    <div className="space-y-3">
      <SectionHeader title={title} />
      <ol className="grid gap-2">
        {items.map((item, index) => (
          <li
            key={item.key}
            className="relative overflow-hidden rounded-xl bg-card"
          >
            <div
              className="absolute inset-y-0 left-0 bg-primary/15"
              style={{
                width: `${Math.max(4, Math.round((item.plays / max) * 100))}%`,
              }}
            />
            <div className="relative grid min-h-16 grid-cols-[2rem_1fr_auto] items-center gap-3 px-3 py-3">
              <span className="font-mono text-xs font-bold text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">
                  {item.primary}
                </span>
                {item.secondary && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.secondary}
                  </span>
                )}
              </span>
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-bold">
                {item.plays} {item.plays === 1 ? "play" : "plays"}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SectionHeader({
  title,
  href,
  action,
}: {
  title: string;
  href?: string;
  action?: string;
}) {
  return (
    <header className="flex items-baseline justify-between gap-3">
      <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
      {href && action && (
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground"
        >
          {action}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </header>
  );
}

function EmptyStats({ rangeLabel }: { rangeLabel: string }) {
  return (
    <section className="rounded-2xl border-2 border-dashed border-foreground/15 bg-card p-10 text-center">
      <Flame className="mx-auto mb-4 h-8 w-8 text-muted-foreground/60" />
      <h2 className="text-lg font-extrabold tracking-tight">No plays yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        Nothing recorded for {rangeLabel}. Play some music — full listens count
        once you get past halfway — and your recap will show up here.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link
          href="/home"
          className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-pastel-pink/80"
        >
          <Disc3 className="h-4 w-4" />
          Play some music
        </Link>
      </div>
    </section>
  );
}
