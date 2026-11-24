import type { AppError, ErrorCode } from "@/types/errors";

const KNOWN_CODES = new Set<ErrorCode>([
  "INVALID_FILE_TYPE",
  "PDF_CORRUPTED",
  "PDF_EMPTY",
  "PDF_ENCRYPTED",
  "FILE_TOO_LARGE",
  "FILE_NOT_FOUND",
  "API_KEY_MISSING",
  "API_KEY_INVALID",
  "API_AUTH_FAILED",
  "API_PERMISSION_DENIED",
  "API_RATE_LIMITED",
  "API_UNAVAILABLE",
  "NETWORK_OFFLINE",
  "INTERPRETATION_FAILED",
  "INSUFFICIENT_DIMENSIONS",
  "GEOMETRY_FAILED",
  "VALIDATION_FAILED",
  "EXPORT_FAILED",
  "EXPORT_EXISTS",
  "WORKER_UNAVAILABLE",
  "WORKER_PROTOCOL",
  "KEYCHAIN_ERROR",
  "STORAGE_ERROR",
  "PROJECT_NOT_FOUND",
  "ARTIFACT_NOT_FOUND",
  "CANCELLED",
  "UNKNOWN",
]);

export function appError(code: ErrorCode, message?: string, detail?: string): AppError {
  return { code, message: message ?? errorCopy(code).title, ...(detail ? { detail } : {}) };
}

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "message" in value &&
    KNOWN_CODES.has((value as { code: ErrorCode }).code)
  );
}

/** Normalizes anything thrown (Tauri invoke errors, DOM errors, strings) into an AppError. */
export function toAppError(value: unknown, fallback: ErrorCode = "UNKNOWN"): AppError {
  if (isAppError(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (isAppError(parsed)) return parsed;
    } catch {
      /* not JSON */
    }
    return appError(fallback, value);
  }
  if (value instanceof Error) return appError(fallback, value.message);
  return appError(fallback);
}

interface ErrorCopy {
  title: string;
  description: string;
}

/** User-facing copy for each error code: what happened and what to do. */
export function errorCopy(code: ErrorCode): ErrorCopy {
  switch (code) {
    case "INVALID_FILE_TYPE":
      return { title: "Unsupported file format", description: "CADify accepts engineering drawings as PDF files (.pdf)." };
    case "PDF_CORRUPTED":
      return { title: "This PDF could not be read", description: "The file may be damaged or incomplete. Re-export it from your CAD or PDF tool and try again." };
    case "PDF_EMPTY":
      return { title: "This PDF has no pages", description: "Choose a drawing that contains at least one page." };
    case "PDF_ENCRYPTED":
      return { title: "This PDF is password-protected", description: "Remove the password protection and upload it again." };
    case "FILE_TOO_LARGE":
      return { title: "Drawing is too large", description: "PDF drawings up to 100 MB are supported. Reduce embedded raster images or split the document." };
    case "FILE_NOT_FOUND":
      return { title: "File not found", description: "The file was moved or deleted. Choose it again." };
    case "API_KEY_MISSING":
      return { title: "Anthropic API key required", description: "Add your API key in Settings to generate models." };
    case "API_KEY_INVALID":
    case "API_AUTH_FAILED":
      return { title: "Anthropic API authentication failed", description: "The API key was rejected. Replace it in Settings and retry." };
    case "API_PERMISSION_DENIED":
      return { title: "API key lacks permission", description: "This key cannot access the required model. Check its workspace in the Anthropic Console." };
    case "API_RATE_LIMITED":
      return { title: "Anthropic API rate limit reached", description: "Wait a moment, then retry." };
    case "API_UNAVAILABLE":
      return { title: "Anthropic API unavailable", description: "The service did not respond. Retry in a few minutes." };
    case "NETWORK_OFFLINE":
      return { title: "No internet connection", description: "Generation needs a connection to the Anthropic API. Reconnect and retry." };
    case "INTERPRETATION_FAILED":
      return { title: "Drawing interpretation failed", description: "The drawing could not be interpreted. Check that it contains dimensioned orthographic views." };
    case "INSUFFICIENT_DIMENSIONS":
      return { title: "Insufficient dimensions", description: "The drawing is missing dimensions needed to build a solid. Add them and upload a revised drawing." };
    case "GEOMETRY_FAILED":
      return { title: "Geometry generation failed", description: "The CAD kernel could not build a valid solid from the interpreted features." };
    case "VALIDATION_FAILED":
      return { title: "Model validation failed", description: "The generated solid did not pass validation, so no files were exported." };
    case "EXPORT_FAILED":
      return { title: "Export failed", description: "The file could not be written. Check that the destination is writable." };
    case "EXPORT_EXISTS":
      return { title: "Files already exist", description: "Choose another folder or replace the existing files." };
    case "WORKER_UNAVAILABLE":
      return { title: "Generation worker unavailable", description: "The local CAD worker is not installed or configured." };
    case "WORKER_PROTOCOL":
      return { title: "Generation worker error", description: "The CAD worker sent an unexpected response." };
    case "KEYCHAIN_ERROR":
      return { title: "Keychain access failed", description: "CADify could not access the macOS Keychain. Check Keychain Access permissions." };
    case "STORAGE_ERROR":
      return { title: "Storage error", description: "CADify could not read or write project data." };
    case "PROJECT_NOT_FOUND":
      return { title: "Project not found", description: "It may have been deleted." };
    case "ARTIFACT_NOT_FOUND":
      return { title: "Model file missing", description: "The generated file is no longer in the project folder. Regenerate the model." };
    case "CANCELLED":
      return { title: "Cancelled", description: "" };
    case "UNKNOWN":
      return { title: "Something went wrong", description: "An unexpected error occurred." };
  }
}

/** True for errors that the user can fix by retrying without changes. */
export function isRetryable(code: ErrorCode): boolean {
  return [
    "API_RATE_LIMITED",
    "API_UNAVAILABLE",
    "NETWORK_OFFLINE",
    "INTERPRETATION_FAILED",
    "GEOMETRY_FAILED",
    "VALIDATION_FAILED",
    "EXPORT_FAILED",
    "WORKER_PROTOCOL",
    "UNKNOWN",
  ].includes(code);
}

export function needsSettings(code: ErrorCode): boolean {
  return ["API_KEY_MISSING", "API_KEY_INVALID", "API_AUTH_FAILED", "API_PERMISSION_DENIED"].includes(code);
}
