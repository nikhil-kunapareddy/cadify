import { useCredentialStore } from "@/stores/credentialStore";
import { useGenerationStore } from "@/stores/generationStore";
import { useNetworkStore } from "@/stores/networkStore";
import { useProjectStore } from "@/stores/projectStore";

export type GenerateBlocker = "no_drawing" | "loading_drawing" | "checking_key" | "no_api_key" | "offline" | "busy";

export interface GenerateAvailability {
  canGenerate: boolean;
  blocker: GenerateBlocker | null;
  reason: string | null;
}

const REASONS: Record<GenerateBlocker, string> = {
  no_drawing: "Upload a PDF drawing to generate a model.",
  loading_drawing: "Wait for the drawing to finish loading.",
  checking_key: "Checking API configuration…",
  no_api_key: "Add your Anthropic API key in Settings to enable generation.",
  offline: "No internet connection. Generation requires the Anthropic API.",
  busy: "A generation is already running.",
};

export function useGenerateAvailability(): GenerateAvailability {
  const hasDrawing = useProjectStore((s) => Boolean(s.project?.drawing && s.pdf));
  const loading = useProjectStore((s) => ["reading", "parsing", "rendering", "saving"].includes(s.load.phase));
  const credLoading = useCredentialStore((s) => s.loading && !s.status);
  const configured = useCredentialStore((s) => Boolean(s.status?.configured));
  const online = useNetworkStore((s) => s.online);
  const busy = useGenerationStore((s) => s.status === "running" || s.status === "clarification");

  let blocker: GenerateBlocker | null = null;
  if (busy) blocker = "busy";
  else if (loading) blocker = "loading_drawing";
  else if (!hasDrawing) blocker = "no_drawing";
  else if (credLoading) blocker = "checking_key";
  else if (!configured) blocker = "no_api_key";
  else if (!online) blocker = "offline";

  return { canGenerate: blocker === null, blocker, reason: blocker ? REASONS[blocker] : null };
}
