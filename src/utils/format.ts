import type { LengthUnit } from "@/types/generation";
import type { PageSize } from "@/types/drawing";

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

const dateTime = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const dateOnly = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
const timeOnly = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dateTime.format(d);
}

/** "Today, 1:09 AM" / "Yesterday, 4:12 PM" / "Nov 3, 2026". */
export function formatRelativeDate(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days === 0) return `Today, ${timeOnly.format(d)}`;
  if (days === 1) return `Yesterday, ${timeOnly.format(d)}`;
  return dateOnly.format(d);
}

/** Elapsed time as m:ss. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Short duration such as "0.8s" or "12s". */
export function formatDuration(ms: number): string {
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return formatElapsed(ms);
}

export function formatLength(value: number, unit: LengthUnit): string {
  const digits = unit === "mm" ? 1 : 3;
  return `${value.toFixed(digits)} ${unit}`;
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat().format(n);
}

const PT_PER_MM = 72 / 25.4;

const ISO_SIZES: Array<[string, number, number]> = [
  ["A0", 841, 1189],
  ["A1", 594, 841],
  ["A2", 420, 594],
  ["A3", 297, 420],
  ["A4", 210, 297],
  ["ANSI B", 279.4, 431.8],
  ["ANSI C", 431.8, 558.8],
  ["ANSI D", 558.8, 863.6],
  ["Letter", 215.9, 279.4],
  ["Tabloid", 279.4, 431.8],
];

/** Describes a page size, e.g. "A3 landscape · 420 × 297 mm". */
export function describePageSize(size: PageSize | undefined): string {
  if (!size) return "—";
  const w = size.widthPt / PT_PER_MM;
  const h = size.heightPt / PT_PER_MM;
  const short = Math.min(w, h);
  const long = Math.max(w, h);
  const orientation = w >= h ? "landscape" : "portrait";
  const match = ISO_SIZES.find(([, a, b]) => Math.abs(a - short) < 3 && Math.abs(b - long) < 3);
  const dims = `${Math.round(w)} × ${Math.round(h)} mm`;
  return match ? `${match[0]} ${orientation} · ${dims}` : `${dims}`;
}

export function stripExtension(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i > 0 ? fileName.slice(0, i) : fileName;
}

/** Turns a file name into a readable project name: "mounting-bracket_rev2" -> "Mounting bracket rev2". */
export function projectNameFromFile(fileName: string): string {
  const base = stripExtension(fileName).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!base) return "Untitled project";
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Safe file base name for exports. */
export function exportBaseName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
  return cleaned || "model";
}
