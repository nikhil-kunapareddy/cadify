import type { CredentialService } from "@/services/contracts";
import type { CredentialStatus, KeyValidation } from "@/types/settings";
import { call } from "./ipc";

/**
 * The API key lives in the macOS Keychain, managed by the Rust backend.
 * The frontend only ever sends a key in (save/validate) and receives a
 * status with the last four characters; it never reads the key back.
 */
export class TauriCredentialService implements CredentialService {
  readonly storage = "keychain" as const;

  status(): Promise<CredentialStatus> {
    return call("credentials_status");
  }

  save(apiKey: string): Promise<CredentialStatus> {
    return call("credentials_save", { apiKey });
  }

  remove(): Promise<CredentialStatus> {
    return call("credentials_remove");
  }

  validate(candidate?: string): Promise<KeyValidation> {
    return call("credentials_validate", { candidate: candidate ?? null });
  }
}
