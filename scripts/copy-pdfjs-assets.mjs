// Copies pdf.js runtime assets (standard fonts, CMaps) into /public so they
// are served alongside the app in dev and bundled into production builds.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "pdfjs-dist");
const dest = join(root, "public", "pdfjs");

mkdirSync(dest, { recursive: true });
for (const dir of ["standard_fonts", "cmaps", "wasm"]) {
  const from = join(src, dir);
  if (existsSync(from)) cpSync(from, join(dest, dir), { recursive: true });
}
