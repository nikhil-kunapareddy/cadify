import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/utils/cn";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  leading?: ReactNode;
  trailing?: ReactNode;
  invalid?: boolean;
  size?: "sm" | "md";
  mono?: boolean;
  wrapperClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { leading, trailing, invalid, size = "md", mono, className, wrapperClassName, ...rest },
  ref,
) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-md border bg-sunken px-2.5 transition-[border-color,box-shadow] duration-100",
        "focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--c-accent-soft)]",
        invalid ? "border-danger focus-within:border-danger focus-within:shadow-[0_0_0_3px_var(--c-danger-soft)]" : "border-line-strong",
        size === "sm" ? "h-7" : "h-8",
        rest.disabled && "opacity-50",
        wrapperClassName,
      )}
    >
      {leading && <span className="flex shrink-0 text-fg-subtle">{leading}</span>}
      <input
        ref={ref}
        className={cn(
          "h-full min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-faint",
          mono && "font-mono text-sm",
          className,
        )}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        aria-invalid={invalid || undefined}
        {...rest}
      />
      {trailing && <span className="flex shrink-0 items-center">{trailing}</span>}
    </div>
  );
});
