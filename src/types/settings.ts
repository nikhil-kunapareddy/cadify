export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

export type CredentialStorage = "keychain" | "memory";

export interface CredentialStatus {
  configured: boolean;
  /** Last four characters only. The full key never reaches the frontend. */
  hint?: string;
  storage: CredentialStorage;
  lastValidation?: KeyValidation;
}

export type KeyValidationState =
  | "valid"
  | "invalid"
  | "permission_denied"
  | "rate_limited"
  | "unreachable"
  | "offline"
  | "unverified";

export interface KeyValidation {
  state: KeyValidationState;
  message: string;
  checkedAt: string;
}

export interface StorageSettings {
  projectDirectory: string;
  tempDirectory?: string;
  databasePath?: string;
}

export interface AppInfo {
  name: string;
  version: string;
  tauriVersion?: string;
  platform: string;
  runtime: "tauri" | "browser";
}
