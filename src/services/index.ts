/**
 * Service registry. Picks implementations once at startup:
 * - Desktop (Tauri): native file dialogs, Keychain, SQLite, filesystem.
 * - Browser preview: in-memory adapters so the UI can run in a plain browser.
 * Generation uses the mock backend unless the worker backend is configured.
 */
import { DESKTOP_GENERATION_BACKEND } from "@/config/app";
import { isTauri } from "@/utils/platform";
import type { Services } from "./contracts";
import { BrowserDrawingFileService } from "./browser/files";
import { BrowserExportService, BrowserSettingsService, MemoryCredentialService } from "./browser/others";
import { BrowserProjectService } from "./browser/projects";
import { MockGenerationService } from "./mock/mockGenerationService";
import type { MockScenario } from "./mock/scenarios";
import { TauriCredentialService } from "./tauri/credentials";
import { TauriExportService } from "./tauri/exports";
import { TauriDrawingFileService } from "./tauri/files";
import { TauriGenerationService } from "./tauri/generation";
import { TauriProjectService } from "./tauri/projects";
import { TauriSettingsService } from "./tauri/settings";

let mockScenario: MockScenario = "success";

/** Set by the developer settings panel; read by the mock backend per run. */
export function setMockScenario(scenario: MockScenario): void {
  mockScenario = scenario;
}

function createServices(): Services {
  if (isTauri()) {
    const projects = new TauriProjectService();
    return {
      runtime: "tauri",
      files: new TauriDrawingFileService(),
      projects,
      exports: new TauriExportService(),
      credentials: new TauriCredentialService(),
      generation:
        DESKTOP_GENERATION_BACKEND === "worker"
          ? new TauriGenerationService()
          : new MockGenerationService(projects, () => mockScenario),
      settings: new TauriSettingsService(),
    };
  }
  const projects = new BrowserProjectService();
  return {
    runtime: "browser",
    files: new BrowserDrawingFileService(),
    projects,
    exports: new BrowserExportService(projects),
    credentials: new MemoryCredentialService(),
    generation: new MockGenerationService(projects, () => mockScenario),
    settings: new BrowserSettingsService(),
  };
}

export const services: Services = createServices();
