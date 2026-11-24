import { open } from "@tauri-apps/plugin-dialog";
import type { DrawingFileService, ReadDrawingResult } from "@/services/contracts";
import type { DrawingSource } from "@/types/drawing";
import { readBrowserFile } from "@/services/browser/files";
import { callBytes } from "./ipc";

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export class TauriDrawingFileService implements DrawingFileService {
  async pick(): Promise<DrawingSource | null> {
    const selected = await open({
      title: "Upload Engineering Drawing",
      multiple: false,
      directory: false,
      filters: [{ name: "PDF Drawings", extensions: ["pdf"] }],
    });
    if (!selected || Array.isArray(selected)) return null;
    return { kind: "path", path: selected, fileName: baseName(selected) };
  }

  async read(source: DrawingSource, onProgress?: (fraction: number) => void): Promise<ReadDrawingResult> {
    if (source.kind === "file") return readBrowserFile(source.file, onProgress);
    // Validation (extension, size, header) happens in Rust before any bytes move.
    const bytes = await callBytes("drawing_read", { path: source.path });
    return { bytes, sizeBytes: bytes.byteLength };
  }
}

export function sourceFromPath(path: string): DrawingSource {
  return { kind: "path", path, fileName: baseName(path) };
}
