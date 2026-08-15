import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

// The track carries its colour under a 2px transparent border, so the border is
// the inset the thumb sits in. That makes the gap the same on all four sides and
// makes the travel exactly the thumb's own width — the thumb lands flush against
// each end instead of stopping short of the right one.
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        // Base UI renders a <span role="switch">, which `:disabled` never
        // matches — the disabled look has to hang off `data-disabled`.
        "inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[checked]:bg-primary data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[unchecked]:bg-surface-2",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-5 rounded-full bg-foreground transition-transform data-[checked]:translate-x-5 data-[unchecked]:translate-x-0"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
