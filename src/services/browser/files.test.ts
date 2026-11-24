import { describe, expect, it } from "vitest";
import { hasPdfHeader, validateDrawingBytes } from "./files";

const enc = (s: string) => new TextEncoder().encode(s);

describe("PDF validation", () => {
  it("finds the header, allowing leading junk", () => {
    expect(hasPdfHeader(enc("%PDF-1.7\n"))).toBe(true);
    expect(hasPdfHeader(enc("﻿%PDF-1.4"))).toBe(true);
    expect(hasPdfHeader(enc("PK\u0003\u0004"))).toBe(false);
  });

  it("rejects wrong types, empty, oversized and corrupted files", () => {
    expect(() => validateDrawingBytes("a.png", enc("%PDF-1.4"))).toThrow(expect.objectContaining({ code: "INVALID_FILE_TYPE" }));
    expect(() => validateDrawingBytes("a.pdf", new Uint8Array())).toThrow(expect.objectContaining({ code: "PDF_EMPTY" }));
    expect(() => validateDrawingBytes("a.pdf", enc("hello"))).toThrow(expect.objectContaining({ code: "PDF_CORRUPTED" }));
    const big = { byteLength: 101 * 1024 * 1024 } as Uint8Array;
    expect(() => validateDrawingBytes("a.pdf", big)).toThrow(expect.objectContaining({ code: "FILE_TOO_LARGE" }));
    expect(() => validateDrawingBytes("Drawing.PDF", enc("%PDF-1.4 ok"))).not.toThrow();
  });
});
