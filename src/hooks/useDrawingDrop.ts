import { useEffect, useState } from "react";
import { sourceFromPath } from "@/services/tauri/files";
import { toast } from "@/stores/toastStore";
import { requestUpload } from "@/stores/workflow";
import { errorCopy } from "@/utils/errors";
import { isTauri } from "@/utils/platform";

export type DropState = "idle" | "valid" | "invalid";

function isPdfName(name: string) {
  return /\.pdf$/i.test(name);
}

function rejectMany() {
  toast.warning("Drop one drawing at a time", { description: "CADify works on a single PDF per project." });
}

function rejectType(name?: string) {
  const copy = errorCopy("INVALID_FILE_TYPE");
  toast.error(copy.title, { description: name ? `“${name}” is not a PDF. ${copy.description}` : copy.description });
}

/**
 * Window-wide drag and drop. In the desktop app, Tauri intercepts file drops
 * and reports absolute paths; in the browser we use HTML5 drag events.
 */
export function useDrawingDrop(enabled: boolean): DropState {
  const [state, setState] = useState<DropState>("idle");

  useEffect(() => {
    if (!enabled) return;

    if (isTauri()) {
      let unlisten: (() => void) | undefined;
      let cancelled = false;
      void import("@tauri-apps/api/webview").then(({ getCurrentWebview }) =>
        getCurrentWebview()
          .onDragDropEvent((event) => {
            const p = event.payload;
            if (p.type === "enter") {
              setState(p.paths.length === 1 && p.paths[0] && isPdfName(p.paths[0]) ? "valid" : "invalid");
            } else if (p.type === "leave") {
              setState("idle");
            } else if (p.type === "drop") {
              setState("idle");
              if (p.paths.length !== 1) return rejectMany();
              const path = p.paths[0]!;
              if (!isPdfName(path)) return rejectType(path.split("/").pop());
              requestUpload(sourceFromPath(path));
            }
          })
          .then((fn) => {
            if (cancelled) fn();
            else unlisten = fn;
          }),
      );
      return () => {
        cancelled = true;
        unlisten?.();
      };
    }

    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth += 1;
      const items = Array.from(e.dataTransfer?.items ?? []);
      const ok = items.length === 1 && (items[0]?.type === "application/pdf" || items[0]?.type === "");
      setState(ok ? "valid" : "invalid");
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setState("idle");
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setState("idle");
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length !== 1) return rejectMany();
      const file = files[0]!;
      if (!isPdfName(file.name) && file.type !== "application/pdf") return rejectType(file.name);
      requestUpload({ kind: "file", file, fileName: file.name });
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [enabled]);

  return state;
}
