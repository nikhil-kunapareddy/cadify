import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog, Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { services } from "@/services";
import { useProjectStore } from "@/stores/projectStore";

interface RenameProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  currentName: string;
}

export function RenameProjectDialog(props: RenameProps) {
  // Remount on open so the field always starts from the current name.
  return <RenameProjectDialogInner key={props.open ? "open" : "closed"} {...props} />;
}

function RenameProjectDialogInner({ open, onOpenChange, projectId, currentName }: RenameProps) {
  const [name, setName] = useState(currentName);
  const [busy, setBusy] = useState(false);
  const rename = useProjectStore((s) => s.renameProject);
  const trimmed = name.trim();
  const submit = async () => {
    if (!trimmed || trimmed === currentName) return onOpenChange(false);
    setBusy(true);
    const ok = await rename(projectId, trimmed);
    setBusy(false);
    if (ok) onOpenChange(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Rename project"
      width={400}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!trimmed} loading={busy} onClick={() => void submit()}>
            Rename
          </Button>
        </>
      }
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Project name"
        autoFocus
        maxLength={120}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
        }}
      />
    </Dialog>
  );
}

interface DeleteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  name: string;
}

export function DeleteProjectDialog({ open, onOpenChange, projectId, name }: DeleteProps) {
  const [busy, setBusy] = useState(false);
  const remove = useProjectStore((s) => s.deleteProject);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete “${name}”?`}
      description={
        services.projects.persistent
          ? "The project folder — including the original PDF and generated CAD files — is moved to the Trash."
          : "The project and its files are removed from this session."
      }
      confirmLabel="Delete project"
      destructive
      busy={busy}
      icon={<Trash2 size={18} className="text-danger" />}
      onConfirm={async () => {
        setBusy(true);
        const ok = await remove(projectId);
        setBusy(false);
        if (ok) onOpenChange(false);
      }}
    />
  );
}
