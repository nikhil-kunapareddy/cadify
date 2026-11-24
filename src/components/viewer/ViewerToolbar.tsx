import { ChevronDown, Grid3x3, Layers, Maximize, Move3d, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "@/components/ui/Button";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownRadioGroup,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/Dropdown";
import { Tooltip } from "@/components/ui/Tooltip";
import { VIEWER_BACKGROUNDS, useViewerStore, type ViewerBackground } from "@/stores/viewerStore";
import { cn } from "@/utils/cn";
import type { DisplayMode, Projection, ViewPreset } from "./viewerEngine";

function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("surface-glass flex h-9 items-center gap-0.5 rounded-lg px-1 shadow-popover", className)}>{children}</div>
  );
}

function Sep() {
  return <div className="mx-1 h-4 w-px bg-line-strong" />;
}

const PRIMARY_VIEWS: Array<{ id: ViewPreset; label: string; key: string }> = [
  { id: "iso", label: "Iso", key: "0" },
  { id: "front", label: "Front", key: "1" },
  { id: "top", label: "Top", key: "7" },
  { id: "right", label: "Right", key: "3" },
];

export function ViewPresetBar({ onView }: { onView: (view: ViewPreset) => void }) {
  return (
    <Pill className="h-8">
      {PRIMARY_VIEWS.map((v) => (
        <Tooltip key={v.id} content={`${v.label === "Iso" ? "Isometric" : v.label} view`} shortcut={v.key}>
          <button
            type="button"
            onClick={() => onView(v.id)}
            className="h-6 rounded-md px-2 text-xs font-medium text-fg-muted hover:bg-hover hover:text-fg"
          >
            {v.label}
          </button>
        </Tooltip>
      ))}
      <Dropdown>
        <DropdownTrigger asChild>
          <button
            type="button"
            aria-label="More views"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg data-[state=open]:bg-active"
          >
            <ChevronDown size={13} />
          </button>
        </DropdownTrigger>
        <DropdownContent align="end">
          <DropdownItem onSelect={() => onView("back")}>Back view</DropdownItem>
          <DropdownItem onSelect={() => onView("left")}>Left view</DropdownItem>
          <DropdownItem onSelect={() => onView("bottom")}>Bottom view</DropdownItem>
        </DropdownContent>
      </Dropdown>
    </Pill>
  );
}

const DISPLAY_OPTIONS: ReadonlyArray<{ value: DisplayMode; label: string; hint?: string }> = [
  { value: "shaded-edges", label: "Shaded with edges" },
  { value: "shaded", label: "Shaded" },
  { value: "wireframe", label: "Wireframe (mesh)", hint: "W" },
];

const BACKGROUND_OPTIONS: ReadonlyArray<{ value: ViewerBackground; label: string }> = [
  { value: "theme", label: "Match theme" },
  ...Object.entries(VIEWER_BACKGROUNDS).map(([value, v]) => ({ value: value as ViewerBackground, label: v.label })),
];

export function ViewerToolbar({ onFit, onReset }: { onFit: () => void; onReset: () => void }) {
  const { grid, axes, display, projection, background, set } = useViewerStore();
  return (
    <Pill>
      <IconButton label="Fit model to view" shortcut="F" icon={<Maximize size={15} />} onClick={onFit} tooltipSide="top" />
      <IconButton label="Reset camera" icon={<RotateCcw size={15} />} onClick={onReset} tooltipSide="top" />
      <Sep />
      <IconButton
        label={grid ? "Hide grid" : "Show grid"}
        shortcut="G"
        icon={<Grid3x3 size={15} />}
        active={grid}
        onClick={() => set({ grid: !grid })}
        tooltipSide="top"
      />
      <IconButton
        label={axes ? "Hide axes" : "Show axes"}
        shortcut="A"
        icon={<Move3d size={15} />}
        active={axes}
        onClick={() => set({ axes: !axes })}
        tooltipSide="top"
      />
      <Dropdown>
        <Tooltip content="Display and background" side="top">
          <DropdownTrigger asChild>
            <button
              type="button"
              aria-label="Display options"
              className={cn(
                "inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 text-fg-muted hover:bg-hover hover:text-fg data-[state=open]:bg-active",
                display === "wireframe" && "bg-active text-fg",
              )}
            >
              <Layers size={15} />
              <ChevronDown size={11} />
            </button>
          </DropdownTrigger>
        </Tooltip>
        <DropdownContent side="top" align="center" className="min-w-[210px]">
          <DropdownLabel>Display</DropdownLabel>
          <DropdownRadioGroup value={display} onChange={(v) => set({ display: v })} options={DISPLAY_OPTIONS} />
          <DropdownSeparator />
          <DropdownLabel>Background</DropdownLabel>
          <DropdownRadioGroup value={background} onChange={(v) => set({ background: v })} options={BACKGROUND_OPTIONS} />
        </DropdownContent>
      </Dropdown>
      <Sep />
      <ProjectionToggle value={projection} onChange={(p) => set({ projection: p })} />
    </Pill>
  );
}

function ProjectionToggle({ value, onChange }: { value: Projection; onChange: (p: Projection) => void }) {
  return (
    <div role="radiogroup" aria-label="Projection" className="flex h-7 items-center rounded-md bg-sunken/60 p-0.5 ring-1 ring-line ring-inset">
      {(
        [
          ["perspective", "Persp", "Perspective projection"],
          ["orthographic", "Ortho", "Orthographic projection"],
        ] as const
      ).map(([id, label, tip]) => (
        <Tooltip key={id} content={tip} shortcut="O" side="top">
          <button
            type="button"
            role="radio"
            aria-checked={value === id}
            onClick={() => onChange(id)}
            className={cn(
              "h-6 rounded-sm px-2 text-xs font-medium",
              value === id ? "bg-btn text-fg shadow-[0_0_0_1px_var(--c-line-strong)]" : "text-fg-muted hover:text-fg",
            )}
          >
            {label}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

