import { FolderOpen, FolderSearch, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/Dropdown";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/ProgressIndicator";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { services } from "@/services";
import { useProjectStore } from "@/stores/projectStore";
import { startNewProject } from "@/stores/workflow";
import type { ProjectSummary } from "@/types/project";
import { cn } from "@/utils/cn";
import { formatRelativeDate } from "@/utils/format";
import { DeleteProjectDialog, RenameProjectDialog } from "./ProjectDialogs";
import { GenerationStatusBadge, ModelAvailability, ProjectThumb } from "./ProjectStatus";

function ProjectRow({ project, current }: { project: ProjectSummary; current: boolean }) {
  const open = useProjectStore((s) => s.openProject);
  const reveal = useProjectStore((s) => s.revealProject);
  const opening = useProjectStore((s) => s.opening === project.id);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <div
      role="row"
      tabIndex={0}
      onDoubleClick={() => void open(project.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") void open(project.id);
      }}
      className={cn(
        "group grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_140px_130px_92px_40px] items-center gap-4 border-b border-line px-4 py-2.5 outline-none last:border-b-0 hover:bg-hover focus-visible:bg-hover",
        current && "bg-accent-soft/40",
      )}
    >
      <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={() => void open(project.id)}>
        <ProjectThumb project={project} />
        <div className="min-w-0">
          <p className="truncate text-base font-medium text-fg">{project.name}</p>
          {current && <p className="text-xs text-accent">Open now</p>}
        </div>
        {opening && <Spinner size={13} className="text-accent" />}
      </button>
      <p className="truncate text-sm text-fg-muted" title={project.drawingFileName}>
        {project.drawingFileName ?? <span className="text-fg-faint">No drawing</span>}
      </p>
      <p className="tabular text-sm text-fg-muted">{formatRelativeDate(project.updatedAt)}</p>
      <div>
        <GenerationStatusBadge status={project.generationStatus} />
      </div>
      <ModelAvailability project={project} />
      <Dropdown>
        <DropdownTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${project.name}`}
            className="inline-flex size-7 items-center justify-center rounded-md text-fg-subtle opacity-70 hover:bg-active hover:text-fg group-hover:opacity-100 data-[state=open]:bg-active data-[state=open]:opacity-100"
          >
            <MoreHorizontal size={15} />
          </button>
        </DropdownTrigger>
        <DropdownContent align="end">
          <DropdownItem icon={<FolderOpen />} onSelect={() => void open(project.id)}>
            Open
          </DropdownItem>
          <DropdownItem icon={<Pencil />} onSelect={() => setRenaming(true)}>
            Rename…
          </DropdownItem>
          {services.projects.canReveal && (
            <DropdownItem icon={<FolderSearch />} onSelect={() => void reveal(project.id)}>
              Reveal in Finder
            </DropdownItem>
          )}
          <DropdownSeparator />
          <DropdownItem icon={<Trash2 />} destructive onSelect={() => setDeleting(true)}>
            Delete…
          </DropdownItem>
        </DropdownContent>
      </Dropdown>
      <RenameProjectDialog open={renaming} onOpenChange={setRenaming} projectId={project.id} currentName={project.name} />
      <DeleteProjectDialog open={deleting} onOpenChange={setDeleting} projectId={project.id} name={project.name} />
    </div>
  );
}

export function ProjectsView() {
  const recent = useProjectStore((s) => s.recent);
  const loaded = useProjectStore((s) => s.recentLoaded);
  const refresh = useProjectStore((s) => s.refreshRecent);
  const currentId = useProjectStore((s) => s.project?.id);
  const [query, setQuery] = useState("");

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recent;
    return recent.filter((p) => p.name.toLowerCase().includes(q) || p.drawingFileName?.toLowerCase().includes(q));
  }, [recent, query]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1080px] px-8 py-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-[-0.015em] text-fg">Projects</h1>
            <p className="mt-1 text-sm text-fg-muted">
              {recent.length} {recent.length === 1 ? "project" : "projects"} ·{" "}
              {services.projects.persistent ? "stored locally on this Mac" : "browser preview, not persisted"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects"
              aria-label="Search projects"
              leading={<Search size={14} />}
              wrapperClassName="w-60"
            />
            <Button variant="primary" icon={<Plus size={14} />} onClick={startNewProject}>
              New Project
            </Button>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-line bg-panel" role="table" aria-label="Projects">
          <div
            role="row"
            className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_140px_130px_92px_40px] gap-4 border-b border-line bg-sunken/40 px-4 py-2"
          >
            {["Project", "Original drawing", "Last modified", "Generation", "Model", ""].map((h, i) => (
              <span key={i} role="columnheader" className="label-caps">
                {h}
              </span>
            ))}
          </div>
          {!loaded ? (
            <LoadingState label="Loading projects…" className="py-14" />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<FolderOpen size={18} />}
              title={query ? "No matching projects" : "No projects yet"}
              description={query ? "Try a different name or file." : "Upload an engineering drawing to create your first project."}
              action={
                !query && (
                  <Button size="sm" icon={<Plus size={13} />} onClick={startNewProject}>
                    New Project
                  </Button>
                )
              }
            />
          ) : (
            filtered.map((p) => <ProjectRow key={p.id} project={p} current={p.id === currentId} />)
          )}
        </div>
      </div>
    </div>
  );
}
