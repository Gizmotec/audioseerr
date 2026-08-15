"use client"

import { Popover } from "@base-ui/react/popover"
import { Info } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

// The small "i" that sits next to a title or a field label. Detail that would
// otherwise be a grey paragraph under every control lives in here, so a form
// reads as a list of things to fill in and the reasoning is one poke away.
// A popover rather than a hover-only tooltip: it opens on hover, focus, and
// tap, so touch users and keyboard users get the same copy.
function Hint({
  children,
  label,
  className,
}: {
  children: ReactNode
  /** Accessible name for the trigger — name what it explains. */
  label: string
  className?: string
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        type="button"
        openOnHover
        delay={120}
        closeDelay={120}
        aria-label={label}
        className={cn(
          "inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[popup-open]:text-foreground",
          className
        )}
      >
        <Info className="size-4" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="top"
          align="center"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 max-w-[min(22rem,calc(100vw-2rem))]"
        >
          <Popover.Popup className="rounded-xl bg-surface-2 px-3 py-2.5 text-xs leading-relaxed text-foreground shadow-xl outline-none transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

export { Hint }
