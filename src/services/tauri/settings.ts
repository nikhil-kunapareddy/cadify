import { getTauriVersion, getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { SettingsService } from "@/services/contracts";
import type { AppInfo, StorageSettings } from "@/types/settings";
import { call } from "./ipc";

export class TauriSettingsService implements SettingsService {
  readonly canChangeDirectory = true;

  getStorage(): Promise<StorageSettings> {
    return call("storage_get");
  }

  async chooseProjectDirectory(): Promise<StorageSettings | null> {
    const selected = await open({ title: "Default Project Folder", directory: true, multiple: false, canCreateDirectories: true });
    if (!selected || Array.isArray(selected)) return null;
    return call("storage_set_project_dir", { path: selected });
  }

  openProjectDirectory(): Promise<void> {
    return call("storage_open_project_dir");
  }

  clearTemporaryFiles(): Promise<{ freedBytes: number }> {
    return call("storage_clear_temp");
  }

  async appInfo(): Promise<AppInfo> {
    const [version, tauriVersion] = await Promise.all([getVersion(), getTauriVersion()]);
    return { name: "CADify", version, tauriVersion, platform: "macOS", runtime: "tauri" };
  }

  openExternal(url: string): Promise<void> {
    return openUrl(url);
  }
}
