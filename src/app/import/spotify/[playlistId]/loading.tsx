import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 md:px-6">
      <div className="flex flex-col items-center justify-center py-24 text-center text-sm text-muted-foreground">
        <Loader2 className="mb-3 h-6 w-6 animate-spin" />
        <p className="font-medium text-foreground">Matching against MusicBrainz</p>
        <p className="mt-1 max-w-md">
          One lookup per unique album, throttled to 1/sec to respect MB&apos;s
          rate limit. Big playlists can take a minute.
        </p>
      </div>
    </main>
  );
}
