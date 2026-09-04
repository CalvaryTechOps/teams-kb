import { describe, expect, it } from "vitest";
import {
  GuideContentError,
  MAX_CONTENT_BYTES,
  blocksToLines,
  blocksToPlainText,
  isEmptyDocument,
  parseGuideContent,
  readingMinutes,
  type GuideBlock,
} from "./guide-content";

// Fixtures are written in the shape the BlockNote editor actually emits
// (`editor.document`), including the bare-array table cells and the trailing
// empty paragraph.

let counter = 0;
const id = () => `block-${++counter}`;
const text = (t: string, styles: Record<string, unknown> = {}) => ({
  type: "text",
  text: t,
  styles,
});
const link = (href: string, label: string) => ({
  type: "link",
  href,
  content: [text(label)],
});
const block = (
  type: string,
  props: Record<string, unknown> = {},
  content: unknown = [],
  children: unknown[] = [],
) => ({ id: id(), type, props, content, children });

const parse = (blocks: unknown) => parseGuideContent(JSON.stringify(blocks));

const fullDocument = () => [
  block("heading", { level: 2, textColor: "blue" }, [text("Setup")]),
  block("paragraph", { textAlignment: "center" }, [
    text("Bold", { bold: true }),
    text(" and "),
    link("https://example.com/portal", "the portal"),
  ]),
  block("bulletListItem", {}, [text("first")], [
    block("bulletListItem", {}, [text("nested")]),
  ]),
  block("numberedListItem", { start: 3 }, [text("three")]),
  block("numberedListItem", {}, [text("four")]),
  block("checkListItem", { checked: true }, [text("done")]),
  block("toggleListItem", {}, [text("more")], [
    block("paragraph", {}, [text("hidden detail")]),
  ]),
  block("quote", {}, [text("remember")]),
  block("codeBlock", { language: "bash" }, [text("npm run dev")]),
  block("diagram", {}, [text("graph TD\n  A --> B")]),
  block("table", { textColor: "default" }, {
    type: "tableContent",
    columnWidths: [null, 120],
    headerRows: 1,
    rows: [
      { cells: [[text("Name")], [text("Role")]] },
      {
        cells: [
          { type: "tableCell", props: { colspan: 2 }, content: [text("Ada")] },
        ],
      },
    ],
  }),
  block("divider"),
  block("image", {
    url: "https://blob.example.com/a.png",
    caption: "Screenshot",
    previewWidth: 320,
  }),
  block("video", { url: "https://blob.example.com/a.mp4", name: "clip.mp4" }),
  block("audio", { url: "https://blob.example.com/a.mp3" }),
  block("paragraph"),
];

describe("parseGuideContent", () => {
  it("accepts every block type and normalizes the shapes", () => {
    const blocks = parse(fullDocument());
    expect(blocks.map((b) => b.type)).toEqual([
      "heading",
      "paragraph",
      "bulletListItem",
      "numberedListItem",
      "numberedListItem",
      "checkListItem",
      "toggleListItem",
      "quote",
      "codeBlock",
      "diagram",
      "table",
      "divider",
      "image",
      "video",
      "audio",
      "paragraph",
    ]);

    const table = blocks.find((b) => b.type === "table")!;
    if (table.type !== "table") throw new Error("unreachable");
    // Bare-array cells become tableCell objects; spans and widths survive.
    expect(table.content.rows[0]!.cells[0]).toEqual({
      type: "tableCell",
      props: {
        colspan: 1,
        rowspan: 1,
        backgroundColor: "default",
        textColor: "default",
        textAlignment: "left",
      },
      content: [text("Name")],
    });
    expect(table.content.rows[1]!.cells[0]!.props.colspan).toBe(2);
    expect(table.content.columnWidths).toEqual([null, 120]);
    expect(table.content.headerRows).toBe(1);

    const image = blocks.find((b) => b.type === "image")!;
    if (image.type !== "image") throw new Error("unreachable");
    expect(image.props).toMatchObject({
      url: "https://blob.example.com/a.png",
      caption: "Screenshot",
      previewWidth: 320,
      showPreview: true,
    });

    const nested = blocks[2]!.children[0]!;
    expect(nested.type).toBe("bulletListItem");
  });

  it("rejects malformed payloads", () => {
    expect(() => parseGuideContent("not json")).toThrow(GuideContentError);
    expect(() => parse({ type: "paragraph" })).toThrow(/array/);
    expect(() => parse([block("marquee")])).toThrow(/unknown block type/);
    expect(() => parse([{ type: "paragraph", props: {}, content: [] }])).toThrow(/id/);
    expect(() => parse([block("paragraph", {}, "text")])).toThrow(/array/);
    expect(() => parse([block("paragraph", {}, [{ type: "mention", id: "x" }])])).toThrow(
      /inline/,
    );
    expect(() => parse([block("table", {}, { type: "tableContent" })])).toThrow(/rows/);
  });

  it("rejects oversize payloads and runaway nesting", () => {
    const huge = JSON.stringify([
      block("paragraph", {}, [text("x".repeat(MAX_CONTENT_BYTES))]),
    ]);
    expect(() => parseGuideContent(huge)).toThrow(/too large/);

    let deep: unknown = block("paragraph", {}, [text("leaf")]);
    for (let i = 0; i < 12; i++) deep = block("paragraph", {}, [], [deep]);
    expect(() => parse([deep])).toThrow(/deeply/);
  });

  it("drops unsafe link targets but keeps their words", () => {
    const [p] = parse([
      block("paragraph", {}, [
        link("javascript:alert(1)", "click me"),
        text(" "),
        link("https://ok.example", "fine"),
        link("mailto:it@example.com", "mail"),
        link("/spaces/tech-ops", "internal"),
        link("#setup", "anchor"),
        link("//evil.example/x", "protocol-relative"),
        link("data:text/html,hi", "data"),
      ]),
    ]);
    if (p!.type !== "paragraph") throw new Error("unreachable");
    expect(p!.content).toEqual([
      text("click me"),
      text(" "),
      link("https://ok.example", "fine"),
      link("mailto:it@example.com", "mail"),
      link("/spaces/tech-ops", "internal"),
      link("#setup", "anchor"),
      text("protocol-relative"),
      text("data"),
    ]);
    expect(JSON.stringify(p)).not.toContain("javascript:");
  });

  it("blanks non-http media URLs", () => {
    const blocks = parse([
      block("image", { url: "data:image/png;base64,AAAA", caption: "x" }),
      block("video", { url: "javascript:alert(1)" }),
      block("audio", { url: "https://blob.example.com/a.mp3" }),
    ]);
    expect(blocks.map((b) => (b.props as { url: string }).url)).toEqual([
      "",
      "",
      "https://blob.example.com/a.mp3",
    ]);
  });

  it("strips unknown props and coerces invalid values to defaults", () => {
    const [h, t] = parse([
      block("heading", { level: 9, textColor: "hotpink", onclick: "x()" }, [text("H")]),
      block("paragraph", {}, [text("styled", { bold: true, color: "red", textColor: "#ff0000", backgroundColor: "yellow" })]),
    ]);
    expect(h!.props).toEqual({
      level: 1,
      textColor: "default",
      backgroundColor: "default",
      textAlignment: "left",
    });
    if (t!.type !== "paragraph") throw new Error("unreachable");
    expect(t!.content[0]).toEqual(text("styled", { bold: true, backgroundColor: "yellow" }));
  });

  it("keeps toggle headings and checked state", () => {
    const [h, c] = parse([
      block("heading", { level: 3, isToggleable: true }, [text("FAQ")]),
      block("checkListItem", { checked: "yes" }, [text("x")]),
    ]);
    expect(h!.props).toMatchObject({ level: 3, isToggleable: true });
    expect(c!.props).toMatchObject({ checked: false });
  });
});

describe("isEmptyDocument", () => {
  it("treats BlockNote's default empty paragraph(s) as empty", () => {
    expect(isEmptyDocument(parse([block("paragraph")]))).toBe(true);
    expect(isEmptyDocument(parse([block("paragraph"), block("paragraph", {}, [text("  \n")])]))).toBe(true);
    expect(isEmptyDocument([])).toBe(true);
  });

  it("counts any real content", () => {
    expect(isEmptyDocument(parse([block("paragraph", {}, [text("a")])]))).toBe(false);
    expect(isEmptyDocument(parse([block("divider")]))).toBe(false);
    expect(isEmptyDocument(parse([block("image", { url: "https://x.example/a.png" })]))).toBe(false);
    expect(isEmptyDocument(parse([block("paragraph", {}, [], [block("paragraph", {}, [text("child")])])]))).toBe(false);
  });
});

describe("text projections", () => {
  const blocks = (): GuideBlock[] => parse(fullDocument());

  it("blocksToLines gives a readable, indented projection", () => {
    expect(blocksToLines(blocks())).toEqual([
      "## Setup",
      "Bold and the portal",
      "- first",
      "  - nested",
      "3. three",
      "4. four",
      "- [x] done",
      "▸ more",
      "  hidden detail",
      "> remember",
      "```bash",
      "npm run dev",
      "```",
      "```mermaid",
      "graph TD",
      "  A --> B",
      "```",
      "Name | Role",
      "Ada",
      "---",
      "[image] Screenshot",
      "[video] clip.mp4",
      "[audio]",
    ]);
  });

  it("blocksToLines ignores styles and colors, so formatting-only edits diff as unchanged", () => {
    const plain = parse([block("paragraph", {}, [text("same words")])]);
    const styled = parse([
      block("paragraph", { textColor: "red", textAlignment: "center" }, [
        text("same ", { bold: true }),
        text("words", { italic: true, backgroundColor: "blue" }),
      ]),
    ]);
    expect(blocksToLines(plain)).toEqual(blocksToLines(styled));
  });

  it("blocksToPlainText keeps searchable words and drops URLs and code", () => {
    const t = blocksToPlainText(blocks());
    expect(t).toContain("Setup");
    expect(t).toContain("the portal");
    expect(t).toContain("hidden detail");
    expect(t).toContain("Name Role Ada");
    expect(t).toContain("Screenshot");
    expect(t).not.toContain("example.com");
    expect(t).not.toContain("npm run dev");
    expect(t).not.toContain("graph TD");
    expect(t).not.toContain("#");
    expect(t).toBe(t.trim());
    expect(t).not.toMatch(/\s{2}/);
  });

  it("readingMinutes rounds at 200 words per minute with a floor of one", () => {
    expect(readingMinutes(blocks())).toBe(1);
    const words = Array.from({ length: 600 }, (_, i) => `w${i}`).join(" ");
    expect(readingMinutes(parse([block("paragraph", {}, [text(words)])]))).toBe(3);
  });
});
