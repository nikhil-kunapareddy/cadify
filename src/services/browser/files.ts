import { MAX_DRAWING_BYTES } from "@/config/app";
import type { DrawingFileService, ReadDrawingResult } from "@/services/contracts";
import type { DrawingSource } from "@/types/drawing";
import { appError } from "@/utils/errors";

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

export function looksLikePdfName(name: string): boolean {
  return /\.pdf$/i.test(name);
}

/** The PDF header may be preceded by a little junk; the spec allows 1024 bytes. */
export function hasPdfHeader(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length - PDF_MAGIC.length, 1024);
  for (let i = 0; i <= limit; i += 1) {
    if (PDF_MAGIC.every((b, j) => bytes[i + j] === b)) return true;
  }
  return false;
}

export function validateDrawingBytes(name: string, bytes: Uint8Array): void {
  if (!looksLikePdfName(name)) throw appError("INVALID_FILE_TYPE");
  if (bytes.byteLength === 0) throw appError("PDF_EMPTY", "This file is empty");
  if (bytes.byteLength > MAX_DRAWING_BYTES) throw appError("FILE_TOO_LARGE");
  if (!hasPdfHeader(bytes)) throw appError("PDF_CORRUPTED", "This file is not a valid PDF");
}

/** Reads a DOM File with real byte progress. */
export function readBrowserFile(file: File, onProgress?: (fraction: number) => void): Promise<ReadDrawingResult> {
  if (!looksLikePdfName(file.name) && file.type !== "application/pdf") {
    return Promise.reject(appError("INVALID_FILE_TYPE"));
  }
  if (file.size > MAX_DRAWING_BYTES) return Promise.reject(appError("FILE_TOO_LARGE"));
  if (file.size === 0) return Promise.reject(appError("PDF_EMPTY", "This file is empty"));

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    reader.onerror = () => reject(appError("PDF_CORRUPTED", "The file could not be read"));
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result as ArrayBuffer);
      try {
        validateDrawingBytes(file.name.toLowerCase().endsWith(".pdf") ? file.name : `${file.name}.pdf`, bytes);
        resolve({ bytes, sizeBytes: bytes.byteLength });
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

export class BrowserDrawingFileService implements DrawingFileService {
  pick(): Promise<DrawingSource | null> {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/pdf,.pdf";
      input.style.display = "none";
      let settled = false;
      input.addEventListener("change", () => {
        settled = true;
        const file = input.files?.[0];
        input.remove();
        resolve(file ? { kind: "file", file, fileName: file.name } : null);
      });
      input.addEventListener("cancel", () => {
        if (!settled) resolve(null);
        input.remove();
      });
      document.body.appendChild(input);
      input.click();
    });
  }

  read(source: DrawingSource, onProgress?: (fraction: number) => void): Promise<ReadDrawingResult> {
    if (source.kind !== "file") return Promise.reject(appError("FILE_NOT_FOUND", "File paths need the desktop app"));
    return readBrowserFile(source.file, onProgress);
  }
}
