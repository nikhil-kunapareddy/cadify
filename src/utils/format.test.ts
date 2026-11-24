import { describe, expect, it } from "vitest";
import {
  describePageSize,
  exportBaseName,
  formatBytes,
  formatElapsed,
  formatLength,
  formatRelativeDate,
  projectNameFromFile,
} from "./format";

describe("formatBytes", () => {
  it("formats across units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(51_342)).toBe("50.1 KB");
    expect(formatBytes(100 * 1024 * 1024)).toBe("100 MB");
    expect(formatBytes(-1)).toBe("—");
  });
});

describe("describePageSize", () => {
  it("recognizes ISO sheet sizes and orientation", () => {
    const mm = 72 / 25.4;
    expect(describePageSize({ widthPt: 420 * mm, heightPt: 297 * mm })).toBe("A3 landscape · 420 × 297 mm");
    expect(describePageSize({ widthPt: 210 * mm, heightPt: 297 * mm })).toBe("A4 portrait · 210 × 297 mm");
    expect(describePageSize({ widthPt: 100 * mm, heightPt: 50 * mm })).toBe("100 × 50 mm");
    expect(describePageSize(undefined)).toBe("—");
  });
});

describe("names", () => {
  it("derives readable project names from files", () => {
    expect(projectNameFromFile("mounting-bracket_rev2.pdf")).toBe("Mounting bracket rev2");
    expect(projectNameFromFile(".pdf")).toBe(".pdf");
    expect(projectNameFromFile("___.pdf")).toBe("Untitled project");
  });

  it("produces safe export base names", () => {
    expect(exportBaseName("Mounting Bracket: Rev/B")).toBe("mounting-bracket-revb");
    expect(exportBaseName("   ")).toBe("model");
  });
});

describe("time and length", () => {
  it("formats elapsed time", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(65_400)).toBe("1:05");
  });

  it("formats lengths with unit-appropriate precision", () => {
    expect(formatLength(120.005, "mm")).toBe("120.0 mm");
    expect(formatLength(4.72441, "in")).toBe("4.724 in");
  });

  it("labels today and yesterday", () => {
    const now = new Date(2026, 10, 24, 15, 0);
    expect(formatRelativeDate(new Date(2026, 10, 24, 9, 30).toISOString(), now)).toMatch(/^Today, /);
    expect(formatRelativeDate(new Date(2026, 10, 23, 9, 30).toISOString(), now)).toMatch(/^Yesterday, /);
    expect(formatRelativeDate(undefined, now)).toBe("—");
  });
});
