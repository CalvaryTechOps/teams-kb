// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { parseGuideContent } from "@/lib/guide-content";
import { exportFilename, guideToBlob } from "./guide-export";

// Conversion contract for the downloads. Markdown and DOCX run headless here;
// PDF rendering needs a real browser (fonts, layout) and is covered by the
// manual test plan in plans/guide-export-menu.md.

let counter = 0;
const id = () => `block-${++counter}`;
const text = (t: string, styles: Record<string, unknown> = {}) => ({
  type: "text",
  text: t,
  styles,
});
const block = (
  type: string,
  props: Record<string, unknown> = {},
  content: unknown = [],
  children: unknown[] = [],
) => ({ id: id(), type, props, content, children });

// Every block type the editor can produce, except media and diagrams where
// noted: DOCX would fetch the image and rasterize the diagram, which needs a
// browser. Markdown handles all of them.
const TEXT_BLOCKS = [
  block("heading", { level: 2 }, [text("Steps")]),
  block("paragraph", {}, [
    text("Open "),
    text("Contacts", { bold: true }),
    { type: "link", href: "https://example.org/mp", content: [text("in MP")] },
    text("."),
  ]),
  block("bulletListItem", {}, [text("first")], [block("bulletListItem", {}, [text("nested")])]),
  block("numberedListItem", { start: 3 }, [text("three")]),
  block("numberedListItem", {}, [text("four")]),
  block("checkListItem", { checked: true }, [text("done")]),
  block("toggleListItem", {}, [text("more")], [block("paragraph", {}, [text("hidden")])]),
  block("quote", {}, [text("Be kind.")]),
  block("codeBlock", { language: "sql" }, [text("select 1;")]),
  block("table", {}, {
    type: "tableContent",
    columnWidths: [null, null],
    headerRows: 1,
    rows: [
      { cells: [[text("Field")], [text("Value")]] },
      { cells: [[text("Email")], [text("a@b.org")]] },
    ],
  }),
  block("divider"),
];
const DIAGRAM = block("diagram", {}, [text("graph TD; A-->B")]);
const MEDIA = [
  block("image", { url: "https://blob.example.org/guides/x.png", caption: "Screenshot" }),
  block("video", { url: "https://blob.example.org/guides/x.mp4", name: "clip" }),
  block("audio", { url: "https://blob.example.org/guides/x.mp3", name: "voice" }),
];

const parse = (blocks: unknown[]) => parseGuideContent(JSON.stringify(blocks));

describe("guide export", () => {
  it("names the file after the title", () => {
    expect(exportFilename("How to correct an email address", "pdf")).toBe(
      "how-to-correct-an-email-address.pdf",
    );
    expect(exportFilename("???", "md")).toBe("untitled.md");
  });

  it("writes Markdown that opens with the title, a rule, then every block", async () => {
    const blob = await guideToBlob("md", {
      title: "Fix an email",
      blocks: parse([...TEXT_BLOCKS, DIAGRAM, ...MEDIA]),
    });
    expect(blob.type).toContain("text/markdown");
    const md = await blob.text();
    expect(md.startsWith("# Fix an email\n\n***\n\n## Steps")).toBe(true);
    expect(md).toContain("## Steps");
    expect(md).toContain("**Contacts**");
    expect(md).toContain("[in MP](https://example.org/mp)");
    expect(md).toContain("* first\n  * nested");
    expect(md).toContain("3. three\n4. four");
    expect(md).toContain("* [x] done");
    expect(md).toContain("> Be kind.");
    expect(md).toContain("```sql\nselect 1;\n```");
    expect(md).toMatch(/\| Field\s+\| Value\s+\|/);
    expect(md).toContain("\n***\n");
    expect(md).toContain("```mermaid\ngraph TD; A-->B\n```");
    expect(md).toContain('src="https://blob.example.org/guides/x.png"');
    expect(md).toContain("![clip](https://blob.example.org/guides/x.mp4)");
    expect(md).toContain('<audio src="https://blob.example.org/guides/x.mp3"');
  });

  it("produces a non-empty DOCX for the text blocks", async () => {
    const blob = await guideToBlob("docx", {
      title: "Fix an email",
      blocks: parse(TEXT_BLOCKS),
    });
    expect(blob.size).toBeGreaterThan(1000);
    // A .docx is a zip: "PK" signature.
    const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
    expect(Array.from(head)).toEqual([0x50, 0x4b]);
  });
});
