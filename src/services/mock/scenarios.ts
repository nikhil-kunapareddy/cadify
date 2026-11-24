/** Scenarios the mock backend can play back, selectable in Settings → Developer. */
export type MockScenario =
  | "success"
  | "success_with_warnings"
  | "clarification"
  | "auth_failed"
  | "interpretation_failed"
  | "insufficient_dimensions"
  | "geometry_failed"
  | "validation_failed";

export const MOCK_SCENARIOS: ReadonlyArray<{ id: MockScenario; label: string; description: string }> = [
  { id: "success", label: "Success", description: "All stages pass and the sample model is produced." },
  { id: "success_with_warnings", label: "Success with warnings", description: "Completes with inferred-dimension warnings." },
  { id: "clarification", label: "Clarification required", description: "Pauses for ambiguous dimensions, then resumes." },
  { id: "auth_failed", label: "API authentication failure", description: "Fails during analysis with a rejected key." },
  { id: "interpretation_failed", label: "Interpretation failure", description: "Claude cannot interpret the drawing." },
  { id: "insufficient_dimensions", label: "Insufficient dimensions", description: "Too few dimensions to build a solid." },
  { id: "geometry_failed", label: "Geometry failure", description: "The CAD kernel fails to build the solid." },
  { id: "validation_failed", label: "Validation failure", description: "The solid fails validation; nothing is exported." },
];
