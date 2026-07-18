import { Bird } from "lucide-react"

import { cn } from "@/lib/utils"

function SpotifyMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.56.3z" />
    </svg>
  )
}

function LastFmMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M10.599 17.211l-.924-2.393s-1.433 1.596-3.579 1.596c-1.915 0-3.209-1.652-3.209-4.276 0-2.624 1.294-4.276 3.268-4.276 2.203 0 3.415 1.541 3.686 3.614l.924 2.339c1.126 2.924 3.264 4.848 8.243 4.848 4.056 0 6.992-1.266 6.992-4.666 0-2.38-1.331-3.669-3.816-4.165l-1.852-.398c-1.267-.273-1.641-.769-1.641-1.591 0-.932.744-1.48 1.949-1.48 1.321 0 2.04.499 2.141 1.688l2.855-.342c-.137-2.318-1.604-3.575-4.925-3.575-2.689 0-4.474 1.056-4.474 3.635 0 1.824.857 2.861 2.959 3.321l1.917.436c1.525.342 2.026.925 2.026 1.961 0 1.122-1.004 1.614-3.254 1.614-3.367 0-4.762-1.555-5.581-4.184l-.958-2.392C14.091 6.265 12.126 4.35 9.234 4.35 5.744 4.35 3.064 7.02 3.064 12.08c0 5.114 2.68 7.764 6.171 7.764 3.628 0 5.823-1.881 5.823-1.881l-2.459-2.752z" />
    </svg>
  )
}

const PROVIDERS = {
  soulseek: {
    label: "Soulseek",
    tile: "bg-teal-500/15 text-teal-500",
    Mark: Bird,
  },
  lastfm: {
    label: "Last.fm",
    tile: "bg-red-500/15 text-red-500",
    Mark: LastFmMark,
  },
  spotify: {
    label: "Spotify",
    tile: "bg-green-500/15 text-green-500",
    Mark: SpotifyMark,
  },
} as const

export type ProviderId = keyof typeof PROVIDERS

export function ProviderLogo({
  provider,
  className,
}: {
  provider: ProviderId
  className?: string
}) {
  const { label, tile, Mark } = PROVIDERS[provider]
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-lg",
        tile,
        className
      )}
      aria-label={label}
      role="img"
    >
      <Mark className="size-5" />
    </span>
  )
}
