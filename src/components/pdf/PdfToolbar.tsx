import { ChevronDown, ChevronLeft, ChevronRight, Expand, MoveHorizontal, ZoomIn, ZoomOut } from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/components/ui/Button";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/Dropdown";
import { Tooltip } from "@/components/ui/Tooltip";
import { MOD } from "@/utils/platform";
import type { ZoomMode } from "./PDFViewer";

interface PdfToolbarProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  zoom: number;
  mode: ZoomMode;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoom: (zoom: number) => void;
  onMode: (mode: ZoomMode) => void;
  compact?: boolean;
}

const PRESETS = [0.5, 0.75, 1, 1.5, 2, 4];

function Sep() {
  return <div className="mx-1 h-4 w-px bg-line-strong" />;
}

export function PdfToolbar({ page, pageCount, onPageChange, zoom, mode, onZoomIn, onZoomOut, onZoom, onMode, compact }: PdfToolbarProps) {
  // The draft only applies to the page it was typed on; page changes reset it.
  const [edit, setEdit] = useState<{ page: number; value: string } | null>(null);
  const draft = edit && edit.page === page ? edit.value : String(page);
  const setDraft = (value: string) => setEdit({ page, value });

  const commit = () => {
    const n = Number.parseInt(draft, 10);
    if (Number.isFinite(n) && n >= 1 && n <= pageCount && n !== page) onPageChange(n);
    setEdit(null);
  };

  return (
    <div className="surface-glass flex h-9 items-center gap-0.5 rounded-lg px-1 shadow-popover" onPointerDown={(e) => e.stopPropagation()}>
      {pageCount > 1 && (
        <>
          <IconButton label="Previous page" shortcut="←" icon={<ChevronLeft size={15} />} disabled={page <= 1} onClick={() => onPageChange(page - 1)} tooltipSide="top" />
          <div className="flex items-center gap-1 px-0.5 text-xs text-fg-muted">
            <input
              aria-label="Page number"
              value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") {
                  setDraft(String(page));
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="tabular h-6 w-8 rounded-sm bg-sunken text-center text-xs text-fg ring-1 ring-line outline-none focus:ring-accent"
            />
            <span className="tabular whitespace-nowrap">of {pageCount}</span>
          </div>
          <IconButton label="Next page" shortcut="→" icon={<ChevronRight size={15} />} disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} tooltipSide="top" />
          <Sep />
        </>
      )}
      <IconButton label="Zoom out" shortcut={`${MOD}−`} icon={<ZoomOut size={15} />} onClick={onZoomOut} tooltipSide="top" />
      <Dropdown>
        <Tooltip content="Zoom level" side="top">
          <DropdownTrigger asChild>
            <button
              type="button"
              aria-label={`Zoom ${Math.round(zoom * 100)}%`}
              className="tabular inline-flex h-7 min-w-[62px] items-center justify-center gap-0.5 rounded-md px-1.5 text-xs font-medium text-fg hover:bg-hover data-[state=open]:bg-active"
            >
              {Math.round(zoom * 100)}%
              <ChevronDown size={11} className="text-fg-subtle" />
            </button>
          </DropdownTrigger>
        </Tooltip>
        <DropdownContent side="top" align="center" className="min-w-[160px]">
          <DropdownItem icon={<Expand />} onSelect={() => onMode("fit")} shortcut={`${MOD}0`}>
            Fit page
          </DropdownItem>
          <DropdownItem icon={<MoveHorizontal />} onSelect={() => onMode("width")}>
            Fit width
          </DropdownItem>
          <DropdownSeparator />
          {PRESETS.map((p) => (
            <DropdownItem key={p} onSelect={() => onZoom(p)}>
              {p * 100}%{p === 1 ? " (actual size)" : ""}
            </DropdownItem>
          ))}
        </DropdownContent>
      </Dropdown>
      <IconButton label="Zoom in" shortcut={`${MOD}+`} icon={<ZoomIn size={15} />} onClick={onZoomIn} tooltipSide="top" />
      {!compact && <Sep />}
      <IconButton
        label="Fit to screen"
        shortcut={`${MOD}0`}
        icon={<Expand size={15} />}
        active={mode === "fit"}
        onClick={() => onMode("fit")}
        tooltipSide="top"
      />
    </div>
  );
}
