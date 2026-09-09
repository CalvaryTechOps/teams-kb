import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Components must be styled with the semantic tokens (surface, fg, accent,
// sidebar, …) so light/dark and the admin's palette apply everywhere. A raw
// palette class (`text-ink`, `bg-grey-100`, `text-white`) or Tailwind's
// default palette (`text-gray-500`) would silently stay fixed in dark mode.
// This test keeps that from creeping back in one PR at a time.

const SRC = fileURLToPath(new URL("..", import.meta.url));

/** PDF/DOCX exports are always light: they may keep literal colors. */
const ALLOW = new Set(["components/guide-export.tsx"]);

const UTILITIES = "bg|text|border|placeholder|divide|ring|outline|fill|stroke|decoration|from|via|to";
const RAW_PALETTE =
  "grey|gray|ink|cyan|blue|green|red|yellow|amber|orange|purple|pink|slate|zinc|neutral|stone|white|black";
const RAW_CLASS = new RegExp(
  `(?<![\\w-])(?:[a-z-]+:)*(?:${UTILITIES})-(?:${RAW_PALETTE})(?:-\\d+)?(?:/\\d+)?(?![\\w-])`,
  "g",
);

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) yield path;
  }
}

describe("semantic theme tokens", () => {
  it("are the only color classes used in components and pages", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file);
      if (ALLOW.has(rel)) continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          for (const match of line.match(RAW_CLASS) ?? []) {
            offenders.push(`${rel}:${i + 1}: ${match}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });

  it("are the only color variables globals.css uses outside @theme", () => {
    const css = readFileSync(join(SRC, "app/globals.css"), "utf8");
    const outsideTheme = css.replace(/@theme\s*\{[\s\S]*?\n\}/, "");
    const raw = outsideTheme.match(/var\(--color-(?:grey|cyan|ink)[^)]*\)/g) ?? [];
    expect(raw).toEqual([]);
  });
});
