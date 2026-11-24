import { FlaskConical, HardDrive, KeyRound, Wifi, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import { services } from "@/services";
import { useCredentialStore } from "@/stores/credentialStore";
import { useGenerationStore } from "@/stores/generationStore";
import { useNetworkStore } from "@/stores/networkStore";
import { useUiStore } from "@/stores/uiStore";
import { cn } from "@/utils/cn";

function Item({ icon, children, tone, tooltip, onClick }: { icon: ReactNode; children: ReactNode; tone?: "warning" | "danger" | "success"; tooltip: string; onClick?: () => void }) {
  const content = (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-xs px-1.5 [&_svg]:size-3",
        tone === "warning" && "text-warning",
        tone === "danger" && "text-danger",
        tone === "success" && "text-fg-subtle [&_svg]:text-success",
        onClick && "hover:bg-hover hover:text-fg",
      )}
    >
      {icon}
      {children}
    </span>
  );
  return (
    <Tooltip content={tooltip} side="top">
      {onClick ? (
        <button type="button" onClick={onClick} className="inline-flex">
          {content}
        </button>
      ) : (
        <span className="inline-flex">{content}</span>
      )}
    </Tooltip>
  );
}

export function StatusBar() {
  const online = useNetworkStore((s) => s.online);
  const cred = useCredentialStore((s) => s.status);
  const result = useGenerationStore((s) => s.result);
  const navigate = useUiStore((s) => s.navigate);
  const mock = services.generation.backend === "mock";

  return (
    <footer
      className="flex shrink-0 items-center justify-between border-t border-line bg-panel px-1.5 text-xs text-fg-subtle"
      style={{ height: "var(--statusbar-height)" }}
    >
      <div className="flex items-center gap-0.5">
        {mock && (
          <Item
            icon={<FlaskConical />}
            tone="warning"
            tooltip="Generation uses the mock backend: it simulates the pipeline and returns a bundled sample model. Configure the CAD worker for real results."
            onClick={() => navigate("settings", "developer")}
          >
            Mock generation backend
          </Item>
        )}
        <Item
          icon={<HardDrive />}
          tooltip={services.projects.persistent ? "Projects are stored on this Mac (SQLite + project folders)." : "Browser preview: projects are kept in memory and lost on reload."}
          tone={services.projects.persistent ? undefined : "warning"}
        >
          {services.projects.persistent ? "Local storage" : "Not persisted"}
        </Item>
        {result && (
          <span className="px-1.5 text-fg-faint">
            Units: <span className="text-fg-subtle">{result.units}</span>
          </span>
        )}
      </div>
      <div className="flex items-center gap-0.5">
        <Item
          icon={<KeyRound />}
          tone={cred?.configured ? "success" : "warning"}
          tooltip={cred?.configured ? `Anthropic API key stored in ${cred.storage === "keychain" ? "the macOS Keychain" : "memory for this session"}` : "Add an Anthropic API key in Settings"}
          onClick={() => navigate("settings", "ai")}
        >
          {cred?.configured ? "API key configured" : "API key missing"}
        </Item>
        <Item
          icon={online ? <Wifi /> : <WifiOff />}
          tone={online ? "success" : "danger"}
          tooltip={online ? "Connected to the internet" : "No internet connection"}
        >
          {online ? "Online" : "Offline"}
        </Item>
      </div>
    </footer>
  );
}
