import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import { Tooltip } from "./Tooltip";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  tooltip?: string;
  shortcut?: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<SegmentOption<T>>;
  size?: "sm" | "md";
  fullWidth?: boolean;
  label: string;
  className?: string;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  fullWidth,
  label,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex rounded-lg bg-sunken p-0.5 ring-1 ring-line ring-inset", fullWidth && "flex w-full", className)}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        const button = (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-100",
              size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-3 text-sm",
              fullWidth && "flex-1",
              selected
                ? "bg-btn text-fg shadow-[0_1px_2px_rgb(0_0_0/0.25),0_0_0_1px_var(--c-line-strong)]"
                : "text-fg-muted hover:text-fg",
              "disabled:pointer-events-none disabled:opacity-40",
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
        return opt.tooltip || opt.shortcut ? (
          <Tooltip key={opt.value} content={opt.tooltip} shortcut={opt.shortcut} wrapDisabled={opt.disabled} className={cn(fullWidth && "flex-1")}>
            {button}
          </Tooltip>
        ) : (
          button
        );
      })}
    </div>
  );
}
