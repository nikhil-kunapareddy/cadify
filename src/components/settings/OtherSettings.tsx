import { BookOpen, FolderOpen, Monitor, Moon, Shield, Sun, Trash } from "lucide-react";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/layout/Logo";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { APP_TAGLINE, DESKTOP_GENERATION_BACKEND } from "@/config/app";
import { services } from "@/services";
import { MOCK_SCENARIOS } from "@/services/mock/scenarios";
import { useDevStore } from "@/stores/devStore";
import { useThemeStore } from "@/stores/themeStore";
import { toast } from "@/stores/toastStore";
import { useUiStore } from "@/stores/uiStore";
import type { AppInfo, StorageSettings, ThemePreference } from "@/types/settings";
import { cn } from "@/utils/cn";
import { toAppError } from "@/utils/errors";
import { formatBytes } from "@/utils/format";
import { SettingsPage, SettingsRow, SettingsSection } from "./SettingsSection";

// --------------------------------------------------------------- appearance

const THEMES: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
];

function ThemePreview({ kind }: { kind: ThemePreference }) {
  const dark = { bg: "#0d0e10", panel: "#141518", line: "#26272b", accent: "#4f8cff", text: "#3a3c42" };
  const light = { bg: "#efeff1", panel: "#ffffff", line: "#dedee2", accent: "#2563eb", text: "#d4d5da" };
  const half = (p: typeof dark, clip?: string) => (
    <svg viewBox="0 0 120 72" className="absolute inset-0 h-full w-full" style={clip ? { clipPath: clip } : undefined}>
      <rect width="120" height="72" fill={p.bg} />
      <rect width="120" height="10" fill={p.panel} />
      <rect y="10" width="28" height="62" fill={p.panel} />
      <rect x="92" y="10" width="28" height="62" fill={p.panel} />
      <path d="M0 10.5h120M28.5 10v62M91.5 10v62" stroke={p.line} />
      <rect x="40" y="24" width="40" height="28" rx="2" fill="#fff" opacity="0.9" />
      <rect x="96" y="58" width="20" height="8" rx="2" fill={p.accent} />
      <rect x="4" y="16" width="18" height="3" rx="1.5" fill={p.text} />
      <rect x="4" y="22" width="12" height="3" rx="1.5" fill={p.text} />
    </svg>
  );
  return (
    <div className="relative aspect-[5/3] w-full overflow-hidden rounded-md ring-1 ring-line-strong">
      {kind === "light" ? half(light) : half(dark)}
      {kind === "system" && half(light, "polygon(60% 0, 100% 0, 100% 100%, 40% 100%)")}
    </div>
  );
}

export function AppearanceSettings() {
  const { preference, setPreference } = useThemeStore();
  return (
    <SettingsPage title="Appearance" description="Choose how CADify looks. Dark is the default.">
      <SettingsSection title="Theme">
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-3 p-4">
          {THEMES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={preference === value}
              onClick={() => setPreference(value)}
              className={cn(
                "flex flex-col gap-2 rounded-lg p-2 text-left transition-colors",
                preference === value ? "bg-accent-soft ring-2 ring-accent" : "ring-1 ring-line hover:bg-hover",
              )}
            >
              <ThemePreview kind={value} />
              <span className="flex items-center gap-1.5 px-0.5 text-sm font-medium text-fg">
                <Icon size={13} className="text-fg-subtle" /> {label}
              </span>
            </button>
          ))}
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}

// ------------------------------------------------------------------ storage

export function StorageSettingsView() {
  const [storage, setStorage] = useState<StorageSettings | null>(null);
  const [clearing, setClearing] = useState(false);
  const desktop = services.runtime === "tauri";

  useEffect(() => {
    services.settings
      .getStorage()
      .then(setStorage)
      .catch((err) => toast.error("Could not read storage settings", { description: toAppError(err).message }));
  }, []);

  const change = async () => {
    try {
      const next = await services.settings.chooseProjectDirectory();
      if (next) {
        setStorage(next);
        toast.success("Default project folder updated", { description: "New projects are created here. Existing projects stay where they are." });
      }
    } catch (err) {
      toast.error("Could not change the project folder", { description: toAppError(err).message });
    }
  };

  const clear = async () => {
    setClearing(true);
    try {
      const { freedBytes } = await services.settings.clearTemporaryFiles();
      toast.success("Temporary files cleared", { description: freedBytes > 0 ? `${formatBytes(freedBytes)} freed` : "Nothing to clear" });
    } catch (err) {
      toast.error("Could not clear temporary files", { description: toAppError(err).message });
    } finally {
      setClearing(false);
    }
  };

  return (
    <SettingsPage title="Storage" description="Projects, drawings and generated CAD files stay on this Mac.">
      <SettingsSection>
        <SettingsRow
          label="Default project folder"
          description={<span className="font-mono text-xs break-all text-fg-muted" data-selectable>{storage?.projectDirectory ?? "…"}</span>}
        >
          <Button size="sm" onClick={() => void change()} disabled={!services.settings.canChangeDirectory}>
            Change…
          </Button>
          <Button
            size="sm"
            icon={<FolderOpen size={13} />}
            disabled={!desktop}
            onClick={() =>
              void services.settings.openProjectDirectory().catch((err) => toast.error("Could not open folder", { description: toAppError(err).message }))
            }
          >
            Open
          </Button>
        </SettingsRow>
        <SettingsRow label="Temporary files" description="Working files left by interrupted generations. Projects are not affected.">
          <Button size="sm" icon={<Trash size={13} />} loading={clearing} onClick={() => void clear()}>
            Clear temporary files
          </Button>
        </SettingsRow>
        {storage?.databasePath && (
          <SettingsRow
            label="Project database"
            description={<span className="font-mono text-xs break-all" data-selectable>{storage.databasePath}</span>}
          />
        )}
      </SettingsSection>
    </SettingsPage>
  );
}

// -------------------------------------------------------------------- about

export function AboutSettings() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const openDialog = useUiStore((s) => s.openDialog);
  useEffect(() => {
    void services.settings.appInfo().then(setInfo);
  }, []);
  const backend = services.generation.backend;
  return (
    <SettingsPage title="About">
      <div className="flex items-center gap-4">
        <LogoMark size={52} />
        <div>
          <p className="text-lg font-semibold text-fg">CADify</p>
          <p className="text-sm text-fg-muted">{APP_TAGLINE}</p>
        </div>
      </div>
      <SettingsSection>
        <SettingsRow label="Version">
          <span className="tabular font-mono text-sm text-fg-muted">{info?.version ?? "…"}</span>
        </SettingsRow>
        {info?.tauriVersion && (
          <SettingsRow label="Tauri runtime">
            <span className="tabular font-mono text-sm text-fg-muted">{info.tauriVersion}</span>
          </SettingsRow>
        )}
        <SettingsRow label="Environment">
          <span className="text-sm text-fg-muted">{info?.runtime === "tauri" ? `Desktop · ${info.platform}` : "Browser preview"}</span>
        </SettingsRow>
        <SettingsRow
          label="Generation backend"
          description={backend === "mock" ? "Simulated pipeline returning a bundled sample model." : "Local CAD worker driven by the native backend."}
        >
          <Badge tone={backend === "mock" ? "warning" : "success"}>{backend === "mock" ? "Mock" : "Worker"}</Badge>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection>
        <SettingsRow label="Documentation" description="Workflow guide and keyboard shortcuts.">
          <Button size="sm" icon={<BookOpen size={13} />} onClick={() => openDialog("help")}>
            Open guide
          </Button>
        </SettingsRow>
        <SettingsRow label="Privacy" description="What stays on your Mac and what is sent to Anthropic.">
          <Button size="sm" icon={<Shield size={13} />} onClick={() => openDialog("privacy")}>
            Read privacy notes
          </Button>
        </SettingsRow>
      </SettingsSection>
    </SettingsPage>
  );
}

// ---------------------------------------------------------------- developer

export function DeveloperSettings() {
  const { scenario, setScenario } = useDevStore();
  return (
    <SettingsPage
      title="Developer"
      description="Controls for the mock generation backend. Shown only while the mock backend is active."
    >
      <SettingsSection
        title="Mock generation scenario"
        description={`Desktop backend setting: ${DESKTOP_GENERATION_BACKEND}. Set VITE_CADIFY_GENERATION_BACKEND=worker to use the CAD worker.`}
      >
        <div role="radiogroup" aria-label="Mock scenario">
          {MOCK_SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={scenario === s.id}
              onClick={() => setScenario(s.id)}
              className="flex w-full items-start gap-3 border-b border-line px-4 py-2.5 text-left last:border-b-0 hover:bg-hover"
            >
              <span
                className={cn(
                  "mt-[3px] flex size-3.5 shrink-0 items-center justify-center rounded-full border",
                  scenario === s.id ? "border-accent" : "border-fg-faint",
                )}
              >
                {scenario === s.id && <span className="size-1.5 rounded-full bg-accent" />}
              </span>
              <span>
                <span className="block text-base text-fg">{s.label}</span>
                <span className="block text-sm text-fg-subtle">{s.description}</span>
              </span>
            </button>
          ))}
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}
