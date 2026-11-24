import { describe, expect, it } from "vitest";
import { errorCopy, isRetryable, needsSettings, toAppError } from "./errors";

describe("toAppError", () => {
  it("passes through backend errors", () => {
    const err = { code: "EXPORT_EXISTS", message: "Files already exist", detail: "a.step" };
    expect(toAppError(err)).toEqual(err);
  });

  it("parses serialized errors", () => {
    expect(toAppError(JSON.stringify({ code: "PDF_EMPTY", message: "Empty" })).code).toBe("PDF_EMPTY");
  });

  it("wraps unknown values with the fallback code", () => {
    expect(toAppError(new Error("boom"), "STORAGE_ERROR")).toEqual({ code: "STORAGE_ERROR", message: "boom" });
    expect(toAppError("plain text").message).toBe("plain text");
    expect(toAppError({ code: "NOT_A_CODE", message: "x" }).code).toBe("UNKNOWN");
  });
});

describe("error policy", () => {
  it("classifies retry and settings actions", () => {
    expect(isRetryable("GEOMETRY_FAILED")).toBe(true);
    expect(isRetryable("API_KEY_INVALID")).toBe(false);
    expect(needsSettings("API_AUTH_FAILED")).toBe(true);
    expect(needsSettings("GEOMETRY_FAILED")).toBe(false);
  });

  it("has copy for user-facing errors", () => {
    expect(errorCopy("INVALID_FILE_TYPE").title).toBe("Unsupported file format");
    expect(errorCopy("FILE_TOO_LARGE").description).toMatch(/100 MB/);
  });
});
