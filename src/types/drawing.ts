/** Physical size of a PDF page in PostScript points (1/72 inch). */
export interface PageSize {
  widthPt: number;
  heightPt: number;
}

/** Facts read from the PDF itself. Nothing here is inferred. */
export interface DrawingMetadata {
  pageCount: number;
  pageSizes: PageSize[];
  pdfVersion?: string;
  title?: string;
  producer?: string;
}

export interface DrawingDocument extends DrawingMetadata {
  fileName: string;
  sizeBytes: number;
  importedAt: string;
}

/** Where a drawing comes from before it is imported into a project. */
export type DrawingSource =
  | { kind: "path"; path: string; fileName: string }
  | { kind: "file"; file: File; fileName: string };
