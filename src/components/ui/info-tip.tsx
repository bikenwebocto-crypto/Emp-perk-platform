'use client'
import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { Info } from 'lucide-react'
import { cn } from '@/utils/cn'

/**
 * Small "i" icon that explains a field. Opens on hover/focus, and on tap
 * (Radix tooltips don't open on touch by default, so we control `open`).
 */
export function InfoTip({
  children,
  className,
  label = 'More information',
}: {
  children: React.ReactNode
  className?: string
  label?: string
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <TooltipPrimitive.Provider delayDuration={150}>
      <TooltipPrimitive.Root open={open} onOpenChange={setOpen}>
        <TooltipPrimitive.Trigger asChild>
          <button
            type="button"
            aria-label={label}
            onClick={(e) => {
              e.preventDefault()
              setOpen((o) => !o)
            }}
            className={cn(
              'inline-flex h-4 w-4 items-center justify-center rounded-full align-middle text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              className,
            )}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side="top"
            sideOffset={6}
            collisionPadding={16}
            className="z-50 max-w-xs rounded-md border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-md"
          >
            {children}
            <TooltipPrimitive.Arrow className="fill-popover" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}

/** Form label with optional required marker and info tooltip. */
export function FieldLabel({
  children,
  htmlFor,
  required,
  info,
  className,
}: {
  children: React.ReactNode
  htmlFor?: string
  required?: boolean
  info?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-1 flex items-center gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {children}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {info && <InfoTip label={`About ${typeof children === 'string' ? children : 'this field'}`}>{info}</InfoTip>}
    </div>
  )
}
