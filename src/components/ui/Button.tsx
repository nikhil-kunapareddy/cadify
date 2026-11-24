import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/utils/cn";
import { Spinner } from "./ProgressIndicator";
import { Tooltip } from "./Tooltip";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-fg hover:bg-accent-hover shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(0_0_0/0.25)]",
  secondary: "bg-btn text-fg border border-line-strong hover:bg-btn-hover shadow-xs",
  ghost: "text-fg-muted hover:bg-hover hover:text-fg",
  danger: "bg-danger text-white hover:bg-danger-hover shadow-xs",
  "danger-ghost": "text-danger hover:bg-danger-soft",
};

const SIZES: Record<ButtonSize, string> = {
  xs: "h-6 px-2 text-xs rounded-sm gap-1",
  sm: "h-7 px-2.5 text-sm rounded-md gap-1.5",
  md: "h-8 px-3 text-base rounded-md gap-1.5",
  lg: "h-9 px-3.5 text-base rounded-lg gap-2",
  xl: "h-10 px-4 text-md rounded-lg gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  trailing?: ReactNode;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, trailing, loading, disabled, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-100 select-none",
        "disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={size === "xs" || size === "sm" ? 12 : 14} /> : icon}
      {children}
      {trailing}
    </button>
  );
});

export type IconButtonSize = "xs" | "sm" | "md";

const ICON_SIZES: Record<IconButtonSize, string> = {
  xs: "h-6 w-6 rounded-sm",
  sm: "h-7 w-7 rounded-md",
  md: "h-8 w-8 rounded-md",
};

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Accessible label; also used as the tooltip text. */
  label: string;
  icon: ReactNode;
  size?: IconButtonSize;
  active?: boolean;
  shortcut?: string;
  tooltip?: boolean;
  tooltipSide?: "top" | "bottom" | "left" | "right";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, size = "sm", active, shortcut, tooltip = true, tooltipSide = "bottom", className, type = "button", ...rest },
  ref,
) {
  const button = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center justify-center text-fg-muted transition-colors duration-100",
        "hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-40",
        active && "bg-active text-fg",
        ICON_SIZES[size],
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
  if (!tooltip) return button;
  return (
    <Tooltip content={label} shortcut={shortcut} side={tooltipSide}>
      {button}
    </Tooltip>
  );
});
