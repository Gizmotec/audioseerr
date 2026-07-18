import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-full border-2 px-2.5 py-0.5 text-xs font-bold whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-ink bg-primary text-primary-foreground",
        secondary: "border-ink bg-secondary text-secondary-foreground",
        destructive: "border-ink bg-destructive text-ink",
        outline: "border-foreground/40 text-foreground",
        success: "border-ink bg-pastel-mint text-ink",
        info: "border-ink bg-pastel-sky text-ink",
        warning: "border-ink bg-pastel-yellow text-ink",
        lavender: "border-ink bg-pastel-lavender text-ink",
        muted: "border-transparent bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
