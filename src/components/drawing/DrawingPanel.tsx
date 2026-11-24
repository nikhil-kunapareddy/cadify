import { ChevronLeft, ChevronRight, FilePlus2, FileText, FolderSearch, MoreHorizontal, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/Dropdown";
import { Spinner } from "@/components/ui/ProgressIndicator";
import { Tooltip } from "@/components/ui/Tooltip";
import { PageThumbnail } from "@/components/pdf/PageThumbnail";
import { pageAspect } from "@/services/pdf/pdfService";
import { services } from "@/services";
import { useProjectStore } from "@/stores/projectStore";
import { pickAndUpload, requestRemoveDrawing, startNewProject } from "@/stores/workflow";
import { formatBytes, formatRelativeDate } from "@/utils/format";
import { MOD } from "@/utils/platform";

const PHASE_LABEL = {
  reading: "Reading file…",
  parsing: "Validating PDF…",
  rendering: "Rendering preview…",
  saving: "Saving to project…",
} as const;

function DocumentCard() {
  const project = useProjectStore((s) => s.project)!;
  const drawing = project.drawing!;
  const revealProject = useProjectStore((s) => s.revealProject);
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-line bg-sunken/50 p-2">
      <div className="flex h-10 w-8 shrink-0 items-center justify-center rounded-[3px] bg-danger-soft text-danger">
        <FileText size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <Tooltip content={drawing.fileName} side="right">
          <p className="truncate text-sm font-medium text-fg" data-selectable>
            {drawing.fileName}
          </p>
        </Tooltip>
        <p className="tabular mt-0.5 text-xs text-fg-subtle">
          {drawing.pageCount} {drawing.pageCount === 1 ? "page" : "pages"} · {formatBytes(drawing.sizeBytes)}
        </p>
        <p className="truncate text-xs text-fg-subtle" title={`Uploaded ${formatRelativeDate(drawing.importedAt)}`}>
          {formatRelativeDate(drawing.importedAt)}
        </p>
      </div>
      <Dropdown>
        <DropdownTrigger asChild>
          <button
            type="button"
            aria-label="Drawing actions"
            className="-mt-0.5 -mr-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-fg-subtle hover:bg-hover hover:text-fg data-[state=open]:bg-active"
          >
            <MoreHorizontal size={15} />
          </button>
        </DropdownTrigger>
        <DropdownContent align="start" side="right">
          <DropdownItem icon={<RefreshCw />} onSelect={() => void pickAndUpload()}>
            Replace drawing…
          </DropdownItem>
          {services.projects.canReveal && (
            <DropdownItem icon={<FolderSearch />} onSelect={() => void revealProject(project.id)}>
              Reveal in Finder
            </DropdownItem>
          )}
          <DropdownSeparator />
          <DropdownItem icon={<Trash2 />} destructive onSelect={requestRemoveDrawing}>
            Remove drawing
          </DropdownItem>
        </DropdownContent>
      </Dropdown>
    </div>
  );
}

function Pages() {
  const pdf = useProjectStore((s) => s.pdf)!;
  const page = useProjectStore((s) => s.page);
  const setPage = useProjectStore((s) => s.setPage);
  const [aspect, setAspect] = useState(1.414);

  useEffect(() => {
    let cancelled = false;
    void pageAspect(pdf, 1).then((a) => !cancelled && setAspect(a));
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between pr-2 pl-3">
        <span className="label-caps">Pages</span>
        <div className="flex items-center gap-0.5">
          <span className="tabular mr-1 text-xs text-fg-subtle">
            {page} / {pdf.numPages}
          </span>
          <IconButton size="xs" label="Previous page" icon={<ChevronLeft size={14} />} disabled={page <= 1} onClick={() => setPage(page - 1)} />
          <IconButton size="xs" label="Next page" icon={<ChevronRight size={14} />} disabled={page >= pdf.numPages} onClick={() => setPage(page + 1)} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <div className="flex flex-col gap-1">
          {Array.from({ length: pdf.numPages }, (_, i) => (
            <PageThumbnail key={i} doc={pdf} page={i + 1} selected={page === i + 1} onSelect={() => setPage(i + 1)} aspect={aspect} />
          ))}
        </div>
      </div>
    </section>
  );
}

function EmptyDrawing() {
  return (
    <div className="px-3 pb-3">
      <button
        type="button"
        onClick={() => void pickAndUpload()}
        className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-6 text-center transition-colors hover:border-accent-line hover:bg-accent-soft/40"
      >
        <span className="flex size-8 items-center justify-center rounded-lg bg-active text-fg-subtle">
          <FilePlus2 size={16} />
        </span>
        <span className="text-sm font-medium text-fg">No drawing yet</span>
        <span className="text-xs text-fg-subtle">Drop a PDF anywhere or click to browse.</span>
      </button>
    </div>
  );
}

export function DrawingPanel() {
  const project = useProjectStore((s) => s.project);
  const pdf = useProjectStore((s) => s.pdf);
  const load = useProjectStore((s) => s.load);
  const busy = load.phase in PHASE_LABEL;
  const hasDrawing = Boolean(project?.drawing && pdf);

  return (
    <aside className="flex w-[248px] shrink-0 flex-col border-r border-line bg-panel" aria-label="Drawing panel">
      <div className="grid shrink-0 grid-cols-2 gap-1.5 border-b border-line p-2">
        <Tooltip content="Start a new project" shortcut={`${MOD}N`}>
          <Button size="sm" icon={<Plus size={14} />} onClick={startNewProject}>
            New Project
          </Button>
        </Tooltip>
        <Tooltip content={hasDrawing ? "Replace the drawing" : "Upload a PDF drawing"} shortcut={`${MOD}O`}>
          <Button size="sm" icon={<Upload size={14} />} onClick={() => void pickAndUpload()} disabled={busy}>
            Upload
          </Button>
        </Tooltip>
      </div>

      <section className="shrink-0 border-b border-line">
        <div className="flex h-9 items-center pr-2 pl-3">
          <span className="label-caps">Drawing</span>
        </div>
        {busy ? (
          <div className="mx-3 mb-3 flex items-center gap-2.5 rounded-lg border border-line bg-sunken/50 p-2.5">
            <Spinner size={14} className="text-accent" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-fg">{load.fileName}</p>
              <p className="text-xs text-fg-subtle">{PHASE_LABEL[load.phase as keyof typeof PHASE_LABEL]}</p>
            </div>
          </div>
        ) : hasDrawing ? (
          <div className="px-3 pb-3">
            <DocumentCard />
          </div>
        ) : (
          <EmptyDrawing />
        )}
      </section>

      {hasDrawing && !busy ? <Pages /> : <div className="flex-1" />}
    </aside>
  );
}
