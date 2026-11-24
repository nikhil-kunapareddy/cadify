import { ArrowLeft, FlaskConical, HardDrive, Info, Palette, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { services } from "@/services";
import { useCredentialStore } from "@/stores/credentialStore";
import { useUiStore, type SettingsSection } from "@/stores/uiStore";
import { cn } from "@/utils/cn";
import { ApiKeySettings } from "./ApiKeySettings";
import { AboutSettings, AppearanceSettings, DeveloperSettings, StorageSettingsView } from "./OtherSettings";

const SECTIONS: Array<{ id: SettingsSection; label: string; icon: ReactNode; hidden?: boolean }> = [
  { id: "ai", label: "AI Configuration", icon: <Sparkles size={15} /> },
  { id: "appearance", label: "Appearance", icon: <Palette size={15} /> },
  { id: "storage", label: "Storage", icon: <HardDrive size={15} /> },
  { id: "about", label: "About", icon: <Info size={15} /> },
  { id: "developer", label: "Developer", icon: <FlaskConical size={15} />, hidden: services.generation.backend !== "mock" },
];

export function SettingsView() {
  const section = useUiStore((s) => s.settingsSection);
  const navigate = useUiStore((s) => s.navigate);
  const keyMissing = useCredentialStore((s) => s.status !== null && !s.status.configured);
  const active = SECTIONS.find((s) => s.id === section && !s.hidden)?.id ?? "ai";

  return (
    <div className="flex h-full">
      <nav className="flex w-[220px] shrink-0 flex-col gap-0.5 border-r border-line bg-panel p-2" aria-label="Settings sections">
        <Button
          variant="ghost"
          size="sm"
          icon={<ArrowLeft size={14} />}
          className="mb-2 justify-start"
          onClick={() => navigate("workspace")}
        >
          Back to workspace
        </Button>
        {SECTIONS.filter((s) => !s.hidden).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => navigate("settings", s.id)}
            aria-current={active === s.id ? "page" : undefined}
            className={cn(
              "flex h-8 items-center gap-2 rounded-md px-2.5 text-base transition-colors [&_svg]:text-fg-subtle",
              active === s.id ? "bg-active font-medium text-fg [&_svg]:text-fg" : "text-fg-muted hover:bg-hover hover:text-fg",
            )}
          >
            {s.icon}
            <span className="flex-1 text-left">{s.label}</span>
            {s.id === "ai" && keyMissing && <span className="size-1.5 rounded-full bg-warning" aria-label="API key missing" />}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[680px] px-10 py-9">
          {active === "ai" && <ApiKeySettings />}
          {active === "appearance" && <AppearanceSettings />}
          {active === "storage" && <StorageSettingsView />}
          {active === "about" && <AboutSettings />}
          {active === "developer" && <DeveloperSettings />}
        </div>
      </div>
    </div>
  );
}
