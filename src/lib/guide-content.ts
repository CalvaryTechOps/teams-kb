// Guide content is a BlockNote document: a JSON array of blocks. This module
// owns the accepted shape — validation on write (parseGuideContent), plus the
// text projections the rest of the app needs (search text, queue diff lines,
// reading time). Pure TypeScript with no React and no BlockNote import, so it
// is unit-testable and safe to share between server actions and renderers.
//
// The types below are written by hand rather than re-exported from
// @blocknote/core so the server bundle never pulls the editor in, and so the
// stored format is pinned by *our* code: a BlockNote upgrade that changes a
// shape must be reconciled here (and bump CONTENT_VERSION if renderers care).

export const CONTENT_VERSION = 1;

/** Raw form payload cap — a guide body should never approach this. */
export const MAX_CONTENT_BYTES = 2 * 1024 * 1024;
/** Block nesting cap (BlockNote nests freely; ten levels is already absurd). */
export const MAX_DEPTH = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** BlockNote's named palette; the only colors the editor UI can pick. */
export const COLOR_NAMES = [
  "default",
  "gray",
  "brown",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
] as const;
export type ColorName = (typeof COLOR_NAMES)[number];

/** Hex values BlockNote renders each palette name as (light theme). */
export const COLORS: Record<
  Exclude<ColorName, "default">,
  { text: string; background: string }
> = {
  gray: { text: "#9b9a97", background: "#ebeced" },
  brown: { text: "#64473a", background: "#e9e5e3" },
  red: { text: "#e03e3e", background: "#fbe4e4" },
  orange: { text: "#d9730d", background: "#f6e9d9" },
  yellow: { text: "#dfab01", background: "#fbf3db" },
  green: { text: "#4d6461", background: "#ddedea" },
  blue: { text: "#0b6e99", background: "#ddebf1" },
  purple: { text: "#6940a5", background: "#eae4f2" },
  pink: { text: "#ad1a72", background: "#f4dfeb" },
};

export const TEXT_ALIGNMENTS = ["left", "center", "right", "justify"] as const;
export type TextAlignment = (typeof TEXT_ALIGNMENTS)[number];

export const HEADING_LEVELS = [1, 2, 3] as const;
export type HeadingLevel = (typeof HEADING_LEVELS)[number];

export type InlineStyles = {
  bold?: true;
  italic?: true;
  underline?: true;
  strike?: true;
  code?: true;
  textColor?: ColorName;
  backgroundColor?: ColorName;
};

export type StyledText = { type: "text"; text: string; styles: InlineStyles };
export type LinkContent = { type: "link"; href: string; content: StyledText[] };
export type InlineContent = StyledText | LinkContent;

export type TableCell = {
  type: "tableCell";
  props: {
    colspan: number;
    rowspan: number;
    backgroundColor: ColorName;
    textColor: ColorName;
    textAlignment: TextAlignment;
  };
  content: InlineContent[];
};

export type TableContent = {
  type: "tableContent";
  columnWidths: (number | null)[];
  headerRows?: number;
  headerCols?: number;
  rows: { cells: TableCell[] }[];
};

type DefaultProps = {
  textColor: ColorName;
  backgroundColor: ColorName;
  textAlignment: TextAlignment;
};

type MediaProps = {
  backgroundColor: ColorName;
  textAlignment: TextAlignment;
  name: string;
  url: string;
  caption: string;
  showPreview: boolean;
  previewWidth?: number;
};

type BlockBase = { id: string; children: GuideBlock[] };

export type GuideBlock = BlockBase &
  (
    | { type: "paragraph"; props: DefaultProps; content: InlineContent[] }
    | {
        type: "heading";
        props: DefaultProps & { level: HeadingLevel; isToggleable?: boolean };
        content: InlineContent[];
      }
    | {
        type: "quote";
        props: { textColor: ColorName; backgroundColor: ColorName };
        content: InlineContent[];
      }
    | { type: "bulletListItem"; props: DefaultProps; content: InlineContent[] }
    | {
        type: "numberedListItem";
        props: DefaultProps & { start?: number };
        content: InlineContent[];
      }
    | {
        type: "checkListItem";
        props: DefaultProps & { checked: boolean };
        content: InlineContent[];
      }
    | { type: "toggleListItem"; props: DefaultProps; content: InlineContent[] }
    | { type: "codeBlock"; props: { language: string }; content: StyledText[] }
    | { type: "diagram"; props: Record<string, never>; content: StyledText[] }
    | { type: "table"; props: { textColor: ColorName }; content: TableContent }
    | { type: "divider"; props: Record<string, never>; content: undefined }
    | { type: "image"; props: MediaProps; content: undefined }
    | { type: "video"; props: MediaProps; content: undefined }
    | { type: "audio"; props: MediaProps; content: undefined }
  );

export type GuideBlockType = GuideBlock["type"];

export const BLOCK_TYPES: readonly GuideBlockType[] = [
  "paragraph",
  "heading",
  "quote",
  "bulletListItem",
  "numberedListItem",
  "checkListItem",
  "toggleListItem",
  "codeBlock",
  "diagram",
  "table",
  "divider",
  "image",
  "video",
  "audio",
];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export class GuideContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuideContentError";
  }
}

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fail(message: string): never {
  throw new GuideContentError(message);
}

function colorProp(v: unknown): ColorName {
  return typeof v === "string" && (COLOR_NAMES as readonly string[]).includes(v)
    ? (v as ColorName)
    : "default";
}

function alignmentProp(v: unknown): TextAlignment {
  return typeof v === "string" &&
    (TEXT_ALIGNMENTS as readonly string[]).includes(v)
    ? (v as TextAlignment)
    : "left";
}

function defaultProps(p: Json): DefaultProps {
  return {
    textColor: colorProp(p.textColor),
    backgroundColor: colorProp(p.backgroundColor),
    textAlignment: alignmentProp(p.textAlignment),
  };
}

function stringProp(v: unknown, max = 2000): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function positiveNumber(v: unknown, max: number): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v > 0 && v <= max
    ? v
    : undefined;
}

/**
 * Link targets and media sources are the only places user content becomes a
 * URL. Allow web URLs, mail links and same-site relative paths; everything
 * else (javascript:, data:, vbscript:, …) is dropped.
 */
export function isSafeHref(href: string): boolean {
  const h = href.trim();
  if (h.length === 0 || h.length > 4096) return false;
  if (/^(https?:)\/\//i.test(h)) return true;
  if (/^mailto:[^\s]+$/i.test(h)) return true;
  return /^[/#][^\s]*$/.test(h) && !h.startsWith("//");
}

/** Media must be fetched over http(s); an empty url is an unfilled block. */
export function isSafeMediaUrl(url: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(url.trim()) && url.length <= 4096;
}

function mediaProps(p: Json, withWidth: boolean): MediaProps {
  const url = stringProp(p.url, 4096);
  const props: MediaProps = {
    backgroundColor: colorProp(p.backgroundColor),
    textAlignment: alignmentProp(p.textAlignment),
    name: stringProp(p.name, 500),
    url: isSafeMediaUrl(url) ? url : "",
    caption: stringProp(p.caption),
    showPreview: p.showPreview !== false,
  };
  if (withWidth) {
    const w = positiveNumber(p.previewWidth, 10000);
    if (w !== undefined) props.previewWidth = w;
  }
  return props;
}

function parseStyles(raw: unknown): InlineStyles {
  const styles: InlineStyles = {};
  if (!isObject(raw)) return styles;
  for (const key of ["bold", "italic", "underline", "strike", "code"] as const) {
    if (raw[key] === true) styles[key] = true;
  }
  for (const key of ["textColor", "backgroundColor"] as const) {
    const c = colorProp(raw[key]);
    if (c !== "default") styles[key] = c;
  }
  return styles;
}

function parseStyledText(raw: unknown, path: string): StyledText {
  if (!isObject(raw) || raw.type !== "text") fail(`${path}: expected text`);
  if (typeof raw.text !== "string") fail(`${path}: text must be a string`);
  return { type: "text", text: raw.text, styles: parseStyles(raw.styles) };
}

function parseInlineContent(raw: unknown, path: string): InlineContent[] {
  if (!Array.isArray(raw)) fail(`${path}: content must be an array`);
  const out: InlineContent[] = [];
  raw.forEach((item, i) => {
    const p = `${path}[${i}]`;
    if (!isObject(item)) fail(`${p}: expected inline content`);
    if (item.type === "link") {
      if (typeof item.href !== "string") fail(`${p}: link href must be a string`);
      if (!Array.isArray(item.content)) fail(`${p}: link content must be an array`);
      const content = item.content.map((t, j) =>
        parseStyledText(t, `${p}.content[${j}]`),
      );
      if (isSafeHref(item.href)) {
        out.push({ type: "link", href: item.href.trim(), content });
      } else {
        // Unsafe target: keep the words, lose the link.
        out.push(...content);
      }
      return;
    }
    if (item.type === "text") {
      out.push(parseStyledText(item, p));
      return;
    }
    fail(`${p}: unknown inline content type`);
  });
  return out;
}

/** Code-style content: text runs only, styles ignored. */
function parsePlainContent(raw: unknown, path: string): StyledText[] {
  if (!Array.isArray(raw)) fail(`${path}: content must be an array`);
  return raw.map((item, i) => {
    const t = parseStyledText(item, `${path}[${i}]`);
    return { type: "text", text: t.text, styles: {} };
  });
}

function parseTableCell(raw: unknown, path: string): TableCell {
  // BlockNote emits cells either as bare inline content arrays or as
  // tableCell objects (once spans/colors are used). Normalize to the latter.
  if (Array.isArray(raw)) {
    return {
      type: "tableCell",
      props: {
        colspan: 1,
        rowspan: 1,
        backgroundColor: "default",
        textColor: "default",
        textAlignment: "left",
      },
      content: parseInlineContent(raw, path),
    };
  }
  if (!isObject(raw) || raw.type !== "tableCell") fail(`${path}: expected cell`);
  const p = isObject(raw.props) ? raw.props : {};
  const span = (v: unknown) =>
    typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 100 ? v : 1;
  return {
    type: "tableCell",
    props: {
      colspan: span(p.colspan),
      rowspan: span(p.rowspan),
      backgroundColor: colorProp(p.backgroundColor),
      textColor: colorProp(p.textColor),
      textAlignment: alignmentProp(p.textAlignment),
    },
    content: parseInlineContent(raw.content ?? [], `${path}.content`),
  };
}

function parseTableContent(raw: unknown, path: string): TableContent {
  if (!isObject(raw) || raw.type !== "tableContent") {
    fail(`${path}: expected tableContent`);
  }
  if (!Array.isArray(raw.rows)) fail(`${path}: rows must be an array`);
  if (raw.rows.length > 500) fail(`${path}: too many rows`);
  const rows = raw.rows.map((row, r) => {
    if (!isObject(row) || !Array.isArray(row.cells)) {
      fail(`${path}.rows[${r}]: expected cells`);
    }
    if (row.cells.length > 100) fail(`${path}.rows[${r}]: too many cells`);
    return {
      cells: row.cells.map((c, i) =>
        parseTableCell(c, `${path}.rows[${r}].cells[${i}]`),
      ),
    };
  });
  const columnWidths = Array.isArray(raw.columnWidths)
    ? raw.columnWidths.map((w) => positiveNumber(w, 10000) ?? null)
    : [];
  const count = (v: unknown) =>
    typeof v === "number" && Number.isInteger(v) && v > 0 ? v : undefined;
  const table: TableContent = { type: "tableContent", columnWidths, rows };
  const headerRows = count(raw.headerRows);
  const headerCols = count(raw.headerCols);
  if (headerRows) table.headerRows = headerRows;
  if (headerCols) table.headerCols = headerCols;
  return table;
}

function parseBlock(raw: unknown, path: string, depth: number): GuideBlock {
  if (depth > MAX_DEPTH) fail(`${path}: nested too deeply`);
  if (!isObject(raw)) fail(`${path}: expected a block`);
  const type = raw.type;
  if (typeof type !== "string" || !(BLOCK_TYPES as string[]).includes(type)) {
    fail(`${path}: unknown block type ${JSON.stringify(type)}`);
  }
  if (typeof raw.id !== "string" || raw.id.length === 0 || raw.id.length > 100) {
    fail(`${path}: block id must be a string`);
  }
  const p = isObject(raw.props) ? raw.props : {};
  const rawChildren = raw.children ?? [];
  if (!Array.isArray(rawChildren)) fail(`${path}: children must be an array`);
  const base = {
    id: raw.id,
    children: rawChildren.map((c, i) =>
      parseBlock(c, `${path}.children[${i}]`, depth + 1),
    ),
  };
  const inline = () => parseInlineContent(raw.content ?? [], `${path}.content`);
  const plain = () => parsePlainContent(raw.content ?? [], `${path}.content`);
  const blockType = type as GuideBlockType;

  switch (blockType) {
    case "paragraph":
    case "bulletListItem":
    case "toggleListItem":
      return { ...base, type: blockType, props: defaultProps(p), content: inline() };
    case "heading": {
      const level =
        typeof p.level === "number" &&
        (HEADING_LEVELS as readonly number[]).includes(p.level)
          ? (p.level as HeadingLevel)
          : 1;
      const props: GuideBlock extends infer B
        ? B extends { type: "heading"; props: infer P }
          ? P
          : never
        : never = { ...defaultProps(p), level };
      if (p.isToggleable === true) props.isToggleable = true;
      return { ...base, type: "heading", props, content: inline() };
    }
    case "quote":
      return {
        ...base,
        type: "quote",
        props: {
          textColor: colorProp(p.textColor),
          backgroundColor: colorProp(p.backgroundColor),
        },
        content: inline(),
      };
    case "numberedListItem": {
      const props: DefaultProps & { start?: number } = defaultProps(p);
      if (typeof p.start === "number" && Number.isInteger(p.start) && p.start >= 0) {
        props.start = p.start;
      }
      return { ...base, type: "numberedListItem", props, content: inline() };
    }
    case "checkListItem":
      return {
        ...base,
        type: "checkListItem",
        props: { ...defaultProps(p), checked: p.checked === true },
        content: inline(),
      };
    case "codeBlock":
      return {
        ...base,
        type: "codeBlock",
        props: { language: stringProp(p.language, 50) || "text" },
        content: plain(),
      };
    case "diagram":
      return { ...base, type: "diagram", props: {}, content: plain() };
    case "table":
      return {
        ...base,
        type: "table",
        props: { textColor: colorProp(p.textColor) },
        content: parseTableContent(raw.content, `${path}.content`),
      };
    case "divider":
      return { ...base, type: "divider", props: {}, content: undefined };
    case "image":
    case "video":
      return { ...base, type: blockType, props: mediaProps(p, true), content: undefined };
    case "audio":
      return { ...base, type: "audio", props: mediaProps(p, false), content: undefined };
  }
}

/**
 * Parse and validate a submitted document. Throws GuideContentError on
 * anything structurally wrong or on unknown block types; silently strips
 * unknown props, unsafe link targets and non-http media URLs.
 */
export function parseGuideContent(raw: string): GuideBlock[] {
  if (raw.length > MAX_CONTENT_BYTES) fail("content too large");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    fail("content is not valid JSON");
  }
  return parseGuideContentJson(json);
}

/** Same validation for an already-parsed value (e.g. a row read back). */
export function parseGuideContentJson(json: unknown): GuideBlock[] {
  if (!Array.isArray(json)) fail("content must be an array of blocks");
  if (json.length > 10000) fail("too many blocks");
  return json.map((b, i) => parseBlock(b, `blocks[${i}]`, 0));
}

// ---------------------------------------------------------------------------
// Text projections
// ---------------------------------------------------------------------------

/** Words of an inline run: link labels kept, URLs dropped. */
export function inlineToText(content: InlineContent[] | undefined): string {
  if (!content) return "";
  return content
    .map((c) =>
      c.type === "link" ? c.content.map((t) => t.text).join("") : c.text,
    )
    .join("");
}

export function plainToText(content: StyledText[] | undefined): string {
  return (content ?? []).map((t) => t.text).join("");
}

function isBlank(s: string): boolean {
  return s.trim().length === 0;
}

/**
 * BlockNote's empty state is a single empty paragraph (plus, usually, the
 * trailing one it keeps at the end). Anything else — a heading, a divider, an
 * image, any text — counts as content.
 */
export function isEmptyDocument(blocks: GuideBlock[]): boolean {
  return blocks.every(
    (b) =>
      b.type === "paragraph" &&
      isBlank(inlineToText(b.content)) &&
      b.children.length === 0,
  );
}

function mediaLine(block: GuideBlock & { type: "image" | "video" | "audio" }) {
  const label = block.props.caption || block.props.name;
  return `[${block.type}]${label ? ` ${label}` : ""}`;
}

/**
 * Deterministic, human-readable line projection for the approval queue diff.
 * Lossy by design (styles, colors, ids and widths are dropped): the reviewer
 * needs to see what *text* changed, not the JSON.
 */
export function blocksToLines(blocks: GuideBlock[], depth = 0): string[] {
  const indent = "  ".repeat(depth);
  const lines: string[] = [];
  let number = 0;
  let prevType: GuideBlockType | undefined;

  for (const block of blocks) {
    // Numbered items count within a contiguous run, honouring an explicit start.
    if (block.type === "numberedListItem") {
      number =
        prevType === "numberedListItem"
          ? number + 1
          : (block.props.start ?? 1);
    }
    prevType = block.type;

    const push = (line: string) => lines.push(indent + line);
    switch (block.type) {
      case "paragraph": {
        const text = inlineToText(block.content);
        if (!isBlank(text)) push(text);
        break;
      }
      case "heading":
        push(`${"#".repeat(block.props.level)} ${inlineToText(block.content)}`);
        break;
      case "quote":
        push(`> ${inlineToText(block.content)}`);
        break;
      case "bulletListItem":
        push(`- ${inlineToText(block.content)}`);
        break;
      case "numberedListItem":
        push(`${number}. ${inlineToText(block.content)}`);
        break;
      case "checkListItem":
        push(`- [${block.props.checked ? "x" : " "}] ${inlineToText(block.content)}`);
        break;
      case "toggleListItem":
        push(`▸ ${inlineToText(block.content)}`);
        break;
      case "codeBlock":
      case "diagram": {
        const lang = block.type === "diagram" ? "mermaid" : block.props.language;
        push("```" + (lang === "text" ? "" : lang));
        for (const l of plainToText(block.content).split("\n")) push(l);
        push("```");
        break;
      }
      case "table":
        for (const row of block.content.rows) {
          push(row.cells.map((c) => inlineToText(c.content)).join(" | "));
        }
        break;
      case "divider":
        push("---");
        break;
      case "image":
      case "video":
      case "audio":
        push(mediaLine(block));
        break;
    }
    if (block.children.length > 0) {
      lines.push(...blocksToLines(block.children, depth + 1));
    }
  }
  return lines;
}

/**
 * Words people would search for: everything readable, including table cells,
 * captions and link labels; excluding URLs and code/diagram source.
 */
export function blocksToPlainText(blocks: GuideBlock[]): string {
  const parts: string[] = [];
  const walk = (list: GuideBlock[]) => {
    for (const block of list) {
      switch (block.type) {
        case "paragraph":
        case "heading":
        case "quote":
        case "bulletListItem":
        case "numberedListItem":
        case "checkListItem":
        case "toggleListItem":
          parts.push(inlineToText(block.content));
          break;
        case "table":
          for (const row of block.content.rows) {
            for (const cell of row.cells) parts.push(inlineToText(cell.content));
          }
          break;
        case "image":
        case "video":
        case "audio":
          parts.push(block.props.caption);
          break;
        case "codeBlock":
        case "diagram":
        case "divider":
          break;
      }
      walk(block.children);
    }
  };
  walk(blocks);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Rough reading time for the article header ("4 min read"), at 200 wpm. */
export function readingMinutes(blocks: GuideBlock[]): number {
  const words = blocksToPlainText(blocks).split(" ").filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
