import { create } from "zustand";
import { setMockScenario } from "@/services";
import type { MockScenario } from "@/services/mock/scenarios";

const KEY = "cadify.dev.mockScenario";

function read(): MockScenario {
  try {
    return (localStorage.getItem(KEY) as MockScenario | null) ?? "success";
  } catch {
    return "success";
  }
}

interface DevState {
  scenario: MockScenario;
  setScenario: (scenario: MockScenario) => void;
}

const initial = read();
setMockScenario(initial);

/** Developer-only controls for the mock generation backend. */
export const useDevStore = create<DevState>((set) => ({
  scenario: initial,
  setScenario: (scenario) => {
    setMockScenario(scenario);
    try {
      localStorage.setItem(KEY, scenario);
    } catch {
      /* non-critical */
    }
    set({ scenario });
  },
}));
