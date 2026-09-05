// Markdown → guide content for the MCP create_draft tool. The parse itself is
// BlockNote's own (the same conversion the editor runs when someone pastes
// Markdown), executed server-side through @blocknote/server-util, which wraps
// it in jsdom. The result is then shaped for this app (pure, unit-tested
// helpers below) and finally validated by the same parseGuideContentJson gate
// the browser's save path uses — so nothing reaches the database that the
// editor couldn't have produced.

import {
  isEmptyDocument,
  parseGuideContentJson,
  type GuideBlock,
} from "@/lib/guide-content";

/** Fence language that becomes a diagram block instead of a code block. */
const DIAGRAM_LANGUAGE = "mermaid";

type RawBlock = {
  type?: unknown;
  props?: unknown;
  content?: unknown;
  children?: unknown;
  [key: string]: unknown;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * ```mermaid fences arrive from the Markdown parser as `codeBlock` with
 * language "mermaid"; the app has a dedicated `diagram` block that renders
 * them, so rewrite in place (recursively — a fence can sit inside a list).
 */
export function mermaidFencesToDiagrams(blocks: unknown[]): unknown[] {
  return blocks.map((raw) => {
    if (!isRecord(raw)) return raw;
    const block = raw as RawBlock;
    const children = Array.isArray(block.children)
      ? mermaidFencesToDiagrams(block.children)
      : block.children;
    if (
      block.type === "codeBlock" &&
      isRecord(block.props) &&
      typeof block.props.language === "string" &&
      block.props.language.trim().toLowerCase() === DIAGRAM_LANGUAGE
    ) {
      return { ...block, type: "diagram", props: {}, children };
    }
    return children === block.children ? block : { ...block, children };
  });
}

function inlineText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => {
      if (!isRecord(c)) return "";
      if (c.type === "link") return inlineText(c.content);
      return typeof c.text === "string" ? c.text : "";
    })
    .join("");
}

function normalizeTitle(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Agents habitually open the body with `# {title}`. The page renders the
 * title itself (and exports add it back), so a leading level-1 heading whose
 * text equals the title is dropped. Only the very first block, only level 1,
 * only an exact (whitespace/case-insensitive) match — anything else stays.
 */
export function stripDuplicateTitleHeading(blocks: unknown[], title: string): unknown[] {
  const [first, ...rest] = blocks;
  if (!isRecord(first) || first.type !== "heading") return blocks;
  const props = isRecord(first.props) ? first.props : {};
  if (props.level !== 1) return blocks;
  if (normalizeTitle(inlineText(first.content)) !== normalizeTitle(title)) return blocks;
  const children = Array.isArray(first.children) ? first.children : [];
  // A heading with nested children is unusual but possible; keep them.
  return [...children, ...rest];
}

export type MarkdownConversion =
  | { ok: true; content: GuideBlock[] }
  | { ok: false; error: string };

/**
 * Shape the parser's output for storage: diagram rewrite, duplicate-title
 * strip, then the app's own validation. Pure — the tool passes in whatever
 * the parser produced.
 */
export function shapeParsedBlocks(blocks: unknown[], title: string): MarkdownConversion {
  const shaped = stripDuplicateTitleHeading(mermaidFencesToDiagrams(blocks), title);
  let content: GuideBlock[];
  try {
    content = parseGuideContentJson(shaped);
  } catch (err) {
    return {
      ok: false,
      error: `The Markdown could not be converted: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (isEmptyDocument(content)) {
    return { ok: false, error: "The Markdown produced no content." };
  }
  return { ok: true, content };
}

// ---------------------------------------------------------------------------
// The parser. Loaded lazily so jsdom is only ever pulled into the process on
// the first create_draft call, and never into a page bundle.
// ---------------------------------------------------------------------------

type ServerEditor = {
  tryParseMarkdownToBlocks(markdown: string): Promise<unknown[]>;
};

let editorPromise: Promise<ServerEditor> | undefined;

function serverEditor(): Promise<ServerEditor> {
  editorPromise ??= import("@blocknote/server-util").then(
    // Default schema on purpose: the client guideSchema pulls the diagram
    // block's DOM renderer; mermaid fences are rewritten afterwards instead.
    ({ ServerBlockNoteEditor }) => ServerBlockNoteEditor.create() as ServerEditor,
  );
  return editorPromise;
}

/** Markdown → validated guide content, or a message the agent can act on. */
export async function markdownToGuideContent(
  markdown: string,
  title: string,
): Promise<MarkdownConversion> {
  if (markdown.trim().length === 0) {
    return { ok: false, error: "The Markdown produced no content." };
  }
  let blocks: unknown[];
  try {
    blocks = await (await serverEditor()).tryParseMarkdownToBlocks(markdown);
  } catch (err) {
    console.error("markdown parse failed", err);
    return { ok: false, error: "The Markdown could not be parsed." };
  }
  return shapeParsedBlocks(blocks, title);
}
