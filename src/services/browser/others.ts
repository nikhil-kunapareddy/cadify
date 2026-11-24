import type {
  CredentialService,
  ExportOutcome,
  ExportService,
  ProjectService,
  SettingsService,
} from "@/services/contracts";
import type { ModelArtifact } from "@/types/generation";
import type { AppInfo, CredentialStatus, KeyValidation, StorageSettings } from "@/types/settings";
import { appError } from "@/utils/errors";

function download(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes.slice().buffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Browser preview: exports become regular downloads. */
export class BrowserExportService implements ExportService {
  readonly canReveal = false;
  constructor(private readonly projects: ProjectService) {}

  async exportOne(projectId: string, artifact: ModelArtifact, baseName: string): Promise<ExportOutcome> {
    const bytes = await this.projects.readArtifact(projectId, artifact.format);
    const fileName = `${baseName}.${artifact.format}`;
    download(bytes, fileName);
    return { format: artifact.format, path: fileName, sizeBytes: bytes.byteLength };
  }

  async chooseDirectory(): Promise<string> {
    return "Downloads";
  }

  async exportToDirectory(projectId: string, artifacts: ModelArtifact[], _dir: string, baseName: string): Promise<ExportOutcome[]> {
    const out: ExportOutcome[] = [];
    for (const artifact of artifacts) out.push(await this.exportOne(projectId, artifact, baseName));
    return out;
  }

  async reveal(): Promise<void> {
    throw appError("UNKNOWN", "Reveal in Finder needs the desktop app");
  }
}

/**
 * Browser preview: the key is held in memory for this tab only. It is never
 * written to localStorage, sessionStorage or any other web storage.
 */
export class MemoryCredentialService implements CredentialService {
  readonly storage = "memory" as const;
  private key: string | null = null;
  private last: KeyValidation | undefined;
  /** Validation of a not-yet-saved key, carried over if that key is saved. */
  private candidate: { key: string; validation: KeyValidation } | null = null;

  async status(): Promise<CredentialStatus> {
    return {
      configured: this.key !== null,
      hint: this.key ? this.key.slice(-4) : undefined,
      storage: "memory",
      lastValidation: this.last,
    };
  }

  async save(apiKey: string): Promise<CredentialStatus> {
    const trimmed = apiKey.trim();
    if (trimmed.length < 20) throw appError("API_KEY_INVALID", "That does not look like an Anthropic API key");
    this.key = trimmed;
    this.last = this.candidate?.key === trimmed ? this.candidate.validation : undefined;
    return this.status();
  }

  async remove(): Promise<CredentialStatus> {
    this.key = null;
    this.last = undefined;
    return this.status();
  }

  async validate(candidate?: string): Promise<KeyValidation> {
    const key = candidate?.trim() || this.key;
    const checkedAt = new Date().toISOString();
    if (!key) throw appError("API_KEY_MISSING");
    const validation: KeyValidation = key.startsWith("sk-ant-")
      ? { state: "unverified", message: "Format looks correct. Live validation runs in the desktop app.", checkedAt }
      : { state: "invalid", message: "Anthropic API keys start with “sk-ant-”.", checkedAt };
    if (candidate?.trim()) this.candidate = { key: candidate.trim(), validation };
    else this.last = validation;
    return validation;
  }
}

export class BrowserSettingsService implements SettingsService {
  readonly canChangeDirectory = false;

  async getStorage(): Promise<StorageSettings> {
    return { projectDirectory: "In memory (browser preview)" };
  }

  async chooseProjectDirectory(): Promise<StorageSettings | null> {
    return null;
  }

  async openProjectDirectory(): Promise<void> {
    throw appError("UNKNOWN", "Opening folders needs the desktop app");
  }

  async clearTemporaryFiles(): Promise<{ freedBytes: number }> {
    return { freedBytes: 0 };
  }

  async appInfo(): Promise<AppInfo> {
    return { name: "CADify", version: "0.1.0", platform: navigator.platform || "Browser", runtime: "browser" };
  }

  async openExternal(url: string): Promise<void> {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
