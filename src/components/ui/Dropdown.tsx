import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

export const Dropdown = Menu.Root;
export const DropdownTrigger = Menu.Trigger;

interface ContentProps {
  children: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
  sideOffset?: number;
}

export function DropdownContent({ children, align = "end", side = "bottom", className, sideOffset = 6 }: ContentProps) {
  return (
    <Menu.Portal>
      <Menu.Content
        align={align}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          "z-[70] min-w-[188px] animate-pop-in rounded-lg bg-elevated p-1 text-base text-fg shadow-popover outline-none",
          className,
        )}
      >
        {children}
      </Menu.Content>
    </Menu.Portal>
  );
}

const itemClass =
  "relative flex h-7 cursor-default items-center gap-2 rounded-md px-2 text-base outline-none select-none " +
  "data-[highlighted]:bg-accent data-[highlighted]:text-accent-fg data-[disabled]:opacity-40 " +
  "[&_svg]:size-[15px] [&_svg]:shrink-0 [&_svg]:text-fg-muted data-[highlighted]:[&_svg]:text-accent-fg";

interface ItemProps {
  children: ReactNode;
  icon?: ReactNode;
  shortcut?: string;
  onSelect?: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

export function DropdownItem({ children, icon, shortcut, onSelect, disabled, destructive }: ItemProps) {
  return (
    <Menu.Item
      className={cn(itemClass, destructive && "text-danger [&_svg]:text-danger data-[highlighted]:bg-danger")}
      onSelect={onSelect}
      disabled={disabled}
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <span className="ml-4 text-xs text-fg-subtle">{shortcut}</span>}
    </Menu.Item>
  );
}

export function DropdownSeparator() {
  return <Menu.Separator className="mx-1 my-1 h-px bg-line" />;
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return <Menu.Label className="px-2 pt-1.5 pb-1 text-xs font-medium text-fg-subtle">{children}</Menu.Label>;
}

interface RadioGroupProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string; icon?: ReactNode; hint?: string }>;
}

export function DropdownRadioGroup<T extends string>({ value, onChange, options }: RadioGroupProps<T>) {
  return (
    <Menu.RadioGroup value={value} onValueChange={(v) => onChange(v as T)}>
      {options.map((opt) => (
        <Menu.RadioItem key={opt.value} value={opt.value} className={cn(itemClass, "pl-7")}>
          <Menu.ItemIndicator className="absolute left-2 inline-flex">
            <Check />
          </Menu.ItemIndicator>
          {opt.icon}
          <span className="flex-1">{opt.label}</span>
          {opt.hint && <span className="ml-4 text-xs text-fg-subtle">{opt.hint}</span>}
        </Menu.RadioItem>
      ))}
    </Menu.RadioGroup>
  );
}

interface CheckboxItemProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  shortcut?: string;
}

export function DropdownCheckboxItem({ checked, onChange, children, shortcut }: CheckboxItemProps) {
  return (
    <Menu.CheckboxItem checked={checked} onCheckedChange={(c) => onChange(c === true)} className={cn(itemClass, "pl-7")}>
      <Menu.ItemIndicator className="absolute left-2 inline-flex">
        <Check />
      </Menu.ItemIndicator>
      <span className="flex-1">{children}</span>
      {shortcut && <span className="ml-4 text-xs text-fg-subtle">{shortcut}</span>}
    </Menu.CheckboxItem>
  );
}
