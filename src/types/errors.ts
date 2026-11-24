/**
 * Error codes shared between the frontend, the Rust backend and the worker.
 * The Rust side serializes errors as `{ code, message, detail? }`.
 */
export type ErrorCode =
  | "INVALID_FILE_TYPE"
  | "PDF_CORRUPTED"
  | "PDF_EMPTY"
  | "PDF_ENCRYPTED"
  | "FILE_TOO_LARGE"
  | "FILE_NOT_FOUND"
  | "API_KEY_MISSING"
  | "API_KEY_INVALID"
  | "API_AUTH_FAILED"
  | "API_PERMISSION_DENIED"
  | "API_RATE_LIMITED"
  | "API_UNAVAILABLE"
  | "NETWORK_OFFLINE"
  | "INTERPRETATION_FAILED"
  | "INSUFFICIENT_DIMENSIONS"
  | "GEOMETRY_FAILED"
  | "VALIDATION_FAILED"
  | "EXPORT_FAILED"
  | "EXPORT_EXISTS"
  | "WORKER_UNAVAILABLE"
  | "WORKER_PROTOCOL"
  | "KEYCHAIN_ERROR"
  | "STORAGE_ERROR"
  | "PROJECT_NOT_FOUND"
  | "ARTIFACT_NOT_FOUND"
  | "CANCELLED"
  | "UNKNOWN";

export interface AppError {
  code: ErrorCode;
  message: string;
  detail?: string;
}
