import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import { Kbd } from "./Kbd";

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={450} skipDelayDuration={250}>
      {children}
    </RadixTooltip.Provider>
  );
}

interface TooltipProps {
  content: ReactNode;
  shortcut?: string;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  children: ReactNode;
  /** Render the tooltip even when the child is disabled (wraps it in a span). */
  wrapDisabled?: boolean;
  className?: string;
  disabled?: boolean;
}

export function Tooltip({ content, shortcut, side = "bottom", align = "center", children, wrapDisabled, className, disabled }: TooltipProps) {
  if (disabled || (!content && !shortcut)) return <>{children}</>;
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>
        {wrapDisabled ? <span className={cn("inline-flex", className)} tabIndex={0}>{children}</span> : children}
      </RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className="z-[80] flex max-w-[280px] animate-fade-in items-center gap-2 rounded-md bg-elevated px-2 py-1 text-xs text-fg shadow-popover"
        >
          <span>{content}</span>
          {shortcut && <Kbd>{shortcut}</Kbd>}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
