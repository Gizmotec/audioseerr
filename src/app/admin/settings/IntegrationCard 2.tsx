"use client"

import { ChevronDown } from "lucide-react"
import type { ReactNode } from "react"

import { ProviderLogo, type ProviderId } from "@/components/provider-logos"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function ConnectionBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <Badge variant="success">
      <span className="size-1.5 rounded-full bg-pastel-mint" />
      Connected
    </Badge>
  ) : (
    <Badge variant="muted">
      <span className="size-1.5 rounded-full bg-muted-foreground/60" />
      Not connected
    </Badge>
  )
}

// Card for a single provider on the Integrations tab. Shows the brand tile,
// connection status, and an Edit/Connect action. `children` render in a
// collapsible config area; `href` turns the action into a link instead
// (used by Spotify, whose OAuth flow lives on the account page).
export function IntegrationCard({
  provider,
  name,
  description,
  connected,
  action,
  children,
}: {
  provider: ProviderId
  name: string
  description: string
  connected: boolean
  action: { href: string } | { onToggle: () => void; expanded: boolean }
  children?: ReactNode
}) {
  const expandable = "onToggle" in action

  return (
    <Card
      size="sm"
      className="gap-0 py-0 transition-shadow hover:ring-foreground/20"
    >
      <div className="flex items-start gap-3 p-4">
        <ProviderLogo provider={provider} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium">{name}</h3>
            <ConnectionBadge connected={connected} />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        {"href" in action ? (
          <a
            href={action.href}
            className={cn(
              buttonVariants({
                variant: connected ? "outline" : "default",
                size: "sm",
              }),
              "shrink-0"
            )}
          >
            {connected ? "Edit" : "Connect"}
          </a>
        ) : (
          <Button
            type="button"
            variant={connected ? "outline" : "default"}
            size="sm"
            onClick={action.onToggle}
            aria-expanded={action.expanded}
            className="shrink-0"
          >
            {connected ? "Edit" : "Connect"}
            <ChevronDown
              className={cn(
                "transition-transform",
                action.expanded && "rotate-180"
              )}
            />
          </Button>
        )}
      </div>
      {expandable && action.expanded && children ? (
        <div className="border-t px-4 py-4">{children}</div>
      ) : null}
    </Card>
  )
}

