/**
 * Thin wrapper around pdf.js. Uses the legacy build for compatibility with
 * older macOS WebKit versions.
 */
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { DrawingMetadata, PageSize } from "@/types/drawing";
import { appError } from "@/utils/errors";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const ASSET_BASE = `${import.meta.env.BASE_URL}pdfjs/`;

/** Max canvas area. WebKit refuses very large canvases and memory balloons. */
const MAX_CANVAS_PIXELS = 24_000_000;

export type PdfDocument = PDFDocumentProxy;

export async function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  // pdf.js transfers the buffer to its worker, so hand it a copy.
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    cMapUrl: `${ASSET_BASE}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${ASSET_BASE}standard_fonts/`,
    wasmUrl: `${ASSET_BASE}wasm/`,
    enableXfa: false,
    stopAtErrors: false,
  });
  let doc: PDFDocumentProxy;
  try {
    doc = await task.promise;
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "PasswordException") throw appError("PDF_ENCRYPTED");
    throw appError("PDF_CORRUPTED", undefined, (err as Error)?.message);
  }
  if (doc.numPages < 1) {
    await closePdf(doc);
    throw appError("PDF_EMPTY");
  }
  return doc;
}

/** Releases the document and its worker-side resources. */
export async function closePdf(doc: PDFDocumentProxy | null | undefined): Promise<void> {
  if (!doc) return;
  try {
    await doc.loadingTask.destroy();
  } catch {
    /* already destroyed */
  }
}

export async function readMetadata(doc: PDFDocumentProxy): Promise<DrawingMetadata> {
  const pageSizes: PageSize[] = [];
  // Page sizes are cheap to read; cap to keep huge documents responsive.
  const count = Math.min(doc.numPages, 200);
  for (let i = 1; i <= count; i += 1) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    pageSizes.push({ widthPt: vp.width, heightPt: vp.height });
  }
  let pdfVersion: string | undefined;
  let title: string | undefined;
  let producer: string | undefined;
  try {
    const meta = await doc.getMetadata();
    const info = meta.info as Record<string, unknown>;
    pdfVersion = typeof info.PDFFormatVersion === "string" ? info.PDFFormatVersion : undefined;
    title = typeof info.Title === "string" && info.Title.trim() ? info.Title.trim() : undefined;
    producer = typeof info.Producer === "string" && info.Producer.trim() ? info.Producer.trim() : undefined;
  } catch {
    /* metadata is optional */
  }
  return { pageCount: doc.numPages, pageSizes, pdfVersion, title, producer };
}

export interface PageRender {
  promise: Promise<void>;
  cancel(): void;
  /** CSS size of the rendered page in px. */
  cssWidth: number;
  cssHeight: number;
}

/**
 * Renders `pageNumber` into `canvas` at `zoom` (1 = 72dpi CSS px).
 * Handles device pixel ratio and clamps the backing store size.
 */
export async function renderPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  zoom: number,
): Promise<PageRender> {
  const page = await doc.getPage(pageNumber);
  const cssViewport = page.getViewport({ scale: zoom });
  const dpr = window.devicePixelRatio || 1;
  let renderScale = zoom * dpr;
  const area = cssViewport.width * cssViewport.height * dpr * dpr;
  if (area > MAX_CANVAS_PIXELS) renderScale *= Math.sqrt(MAX_CANVAS_PIXELS / area);
  const viewport = page.getViewport({ scale: renderScale });

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${Math.floor(cssViewport.width)}px`;
  canvas.style.height = `${Math.floor(cssViewport.height)}px`;

  const task: RenderTask = page.render({ canvas, viewport, background: "#ffffff" });
  return {
    promise: task.promise.catch((err: unknown) => {
      if ((err as { name?: string })?.name === "RenderingCancelledException") return;
      throw err;
    }),
    cancel: () => task.cancel(),
    cssWidth: Math.floor(cssViewport.width),
    cssHeight: Math.floor(cssViewport.height),
  };
}

/** Renders a page to an image data URL at the given pixel width. */
export async function renderThumbnail(
  doc: PDFDocumentProxy,
  pageNumber: number,
  pixelWidth: number,
  type: "image/png" | "image/jpeg" = "image/jpeg",
): Promise<string> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: pixelWidth / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport, background: "#ffffff" }).promise;
  const url = canvas.toDataURL(type, 0.86);
  canvas.width = 0;
  canvas.height = 0;
  return url;
}

export async function pageAspect(doc: PDFDocumentProxy, pageNumber: number): Promise<number> {
  const page = await doc.getPage(pageNumber);
  const vp = page.getViewport({ scale: 1 });
  return vp.width / vp.height;
}

export async function pageBaseSize(doc: PDFDocumentProxy, pageNumber: number): Promise<{ width: number; height: number }> {
  const page = await doc.getPage(pageNumber);
  const vp = page.getViewport({ scale: 1 });
  return { width: vp.width, height: vp.height };
}
