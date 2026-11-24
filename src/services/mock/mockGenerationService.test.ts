import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserProjectService } from "@/services/browser/projects";
import type { GenerationEvent } from "@/types/generation";
import { MockGenerationService } from "./mockGenerationService";
import type { MockScenario } from "./scenarios";

function stlBytes(triangles: number): Uint8Array {
  const buf = new ArrayBuffer(84 + triangles * 50);
  new DataView(buf).setUint32(80, triangles, true);
  return new Uint8Array(buf);
}

async function setup(scenario: MockScenario) {
  const projects = new BrowserProjectService();
  const project = await projects.create("Bracket");
  const service = new MockGenerationService(projects, () => scenario);
  const events: GenerationEvent[] = [];
  const handle = await service.start(
    { projectId: project.id, outputs: ["step", "stl"], drawingFileName: "bracket.pdf", pageCount: 2, modelName: "Bracket" },
    (e) => events.push(e),
  );
  return { projects, project, handle, events };
}

describe("MockGenerationService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        arrayBuffer: async () => (String(url).includes(".stl") ? stlBytes(12) : new TextEncoder().encode("ISO-10303-21;")).slice().buffer,
      })),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("runs all eight stages and stores artifacts", async () => {
    const { projects, project, events } = await setup("success");
    await vi.runAllTimersAsync();
    const started = events.filter((e) => e.type === "stage_started").map((e) => (e as { stage: string }).stage);
    expect(started).toEqual(["prepare", "extract", "analyze", "identify", "reconstruct", "solid", "validate", "export"]);
    const done = events.at(-1);
    expect(done?.type).toBe("completed");
    if (done?.type !== "completed") return;
    expect(done.result.backend).toBe("mock");
    expect(done.result.artifacts.map((a) => a.format)).toEqual(["step", "stl"]);
    expect(done.result.preview.triangleCount).toBe(12);
    await expect(projects.readArtifact(project.id, "preview")).resolves.toHaveLength(84 + 12 * 50);
  });

  it("fails at the configured stage without exporting", async () => {
    const { projects, project, events } = await setup("geometry_failed");
    await vi.runAllTimersAsync();
    const last = events.at(-1);
    expect(last).toMatchObject({ type: "failed", stage: "solid", error: { code: "GEOMETRY_FAILED" } });
    await expect(projects.readArtifact(project.id, "step")).rejects.toMatchObject({ code: "ARTIFACT_NOT_FOUND" });
  });

  it("pauses for clarification and resumes after answers", async () => {
    const { handle, events } = await setup("clarification");
    await vi.runAllTimersAsync();
    expect(events.at(-1)?.type).toBe("clarification_required");
    await handle.answer([{ questionId: "slot-depth" }, { questionId: "rear-corner-radius" }]);
    await vi.runAllTimersAsync();
    expect(events.some((e) => e.type === "warning")).toBe(true);
    const done = events.at(-1);
    expect(done?.type).toBe("completed");
    if (done?.type === "completed") expect(done.result.validation.dimensionConsistency.status).toBe("warn");
  });

  it("emits cancelled when cancelled mid-run", async () => {
    const { handle, events } = await setup("success");
    await vi.advanceTimersByTimeAsync(1500);
    await handle.cancel();
    await vi.runAllTimersAsync();
    expect(events.at(-1)?.type).toBe("cancelled");
    expect(events.some((e) => e.type === "completed")).toBe(false);
  });
});
