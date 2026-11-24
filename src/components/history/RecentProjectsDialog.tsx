import { ArrowRight, FolderOpen, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/ProgressIndicator";
import { EmptyState } from "@/components/ui/States";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore } from "@/stores/uiStore";
import { cn } from "@/utils/cn";
import { formatRelativeDate } from "@/utils/format";
import { GenerationStatusBadge, ProjectThumb } from "./ProjectStatus";

export function RecentProjectsDialog() {
  const open = useUiStore((s) => s.dialog === "recent");
  // Remount per opening so search and selection start fresh.
  return <RecentProjectsDialogInner key={open ? "open" : "closed"} open={open} />;
}

function RecentProjectsDialogInner({ open }: { open: boolean }) {
  const close = useUiStore((s) => s.closeDialog);
  const navigate = useUiStore((s) => s.navigate);
  const recent = useProjectStore((s) => s.recent);
  const refresh = useProjectStore((s) => s.refreshRecent);
  const openProject = useProjectStore((s) => s.openProject);
  const opening = useProjectStore((s) => s.opening);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? recent.filter((p) => p.name.toLowerCase().includes(q) || p.drawingFileName?.toLowerCase().includes(q)) : recent).slice(0, 8);
  }, [recent, query]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title="Open recent project"
      width={520}
      footer={
        <Button
          variant="ghost"
          size="sm"
          trailing={<ArrowRight size={13} />}
          onClick={() => {
            close();
            navigate("projects");
          }}
        >
          Manage all projects
        </Button>
      }
    >
      <Input
        autoFocus
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIndex(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndex((i) => Math.min(i + 1, items.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && items[index]) {
            void openProject(items[index].id);
          }
        }}
        placeholder="Search by project or drawing name"
        aria-label="Search recent projects"
        leading={<Search size={14} />}
      />
      <div className="mt-3 -mx-2 flex max-h-[360px] flex-col overflow-y-auto" role="listbox" aria-label="Recent projects">
        {items.length === 0 ? (
          <EmptyState compact icon={<FolderOpen size={16} />} title={query ? "No matching projects" : "No recent projects"} />
        ) : (
          items.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={i === index}
              onMouseEnter={() => setIndex(i)}
              onClick={() => void openProject(p.id)}
              className={cn("flex items-center gap-3 rounded-lg px-2 py-2 text-left", i === index && "bg-hover")}
            >
              <ProjectThumb project={p} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-medium text-fg">{p.name}</p>
                <p className="truncate text-xs text-fg-subtle">
                  {p.drawingFileName ?? "No drawing"} · {formatRelativeDate(p.updatedAt)}
                </p>
              </div>
              {opening === p.id ? <Spinner size={13} className="text-accent" /> : <GenerationStatusBadge status={p.generationStatus} />}
            </button>
          ))
        )}
      </div>
    </Dialog>
  );
}
