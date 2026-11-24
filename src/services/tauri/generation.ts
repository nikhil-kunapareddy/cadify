import { listen } from "@tauri-apps/api/event";
import type { GenerationHandle, GenerationService } from "@/services/contracts";
import type { ClarificationAnswer, GenerationEvent, GenerationRequest } from "@/types/generation";
import { call } from "./ipc";

interface GenerationEnvelope {
  runId: string;
  event: GenerationEvent;
}

const TERMINAL: ReadonlySet<GenerationEvent["type"]> = new Set(["completed", "failed", "cancelled"]);

/**
 * Production generation backend. The Rust side spawns the local CAD worker,
 * passes it the API key from the Keychain via its environment, and relays the
 * worker's JSON-lines protocol as `generation://event` Tauri events.
 * See docs/worker-protocol.md.
 */
export class TauriGenerationService implements GenerationService {
  readonly backend = "worker" as const;

  async start(request: GenerationRequest, onEvent: (event: GenerationEvent) => void): Promise<GenerationHandle> {
    let runId: string | null = null;
    const early: GenerationEnvelope[] = [];

    const unlisten = await listen<GenerationEnvelope>("generation://event", ({ payload }) => {
      if (runId === null) {
        early.push(payload);
        return;
      }
      if (payload.runId !== runId) return;
      onEvent(payload.event);
      if (TERMINAL.has(payload.event.type)) unlisten();
    });

    try {
      runId = await call<string>("generation_start", { request });
    } catch (err) {
      unlisten();
      throw err;
    }
    for (const env of early.splice(0)) {
      if (env.runId === runId) onEvent(env.event);
    }

    const id = runId;
    return {
      runId: id,
      cancel: () => call("generation_cancel", { runId: id }),
      answer: (answers: ClarificationAnswer[]) => call("generation_answer", { runId: id, answers }),
    };
  }
}
