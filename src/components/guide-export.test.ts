// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { parseGuideContent } from "@/lib/guide-content";
import { exportFilename, guideToBlob, guideToTypst, metaLine } from "./guide-export";

// Conversion contract for the downloads. Markdown and DOCX run headless here,
// and so does the PDF's pure half — the Typst source the compiler is fed. The
// compile itself (a 26 MB wasm engine) and the diagram rendering need a real
// browser and are covered by the manual test plan in plans/pdf-export-typst.md.

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

/** word/document.xml out of a .docx, via the zip's stored/deflated entries. */
async function documentXml(blob: Blob): Promise<string> {
  const { inflateRawSync } = await import("node:zlib");
  const buf = Buffer.from(await blob.arrayBuffer());
  let offset = 0;
  while (buf.readUInt32LE(offset) === 0x04034b50) {
    const method = buf.readUInt16LE(offset + 8);
    const compressed = buf.readUInt32LE(offset + 18);
    const nameLength = buf.readUInt16LE(offset + 26);
    const extraLength = buf.readUInt16LE(offset + 28);
    const name = buf.toString("utf8", offset + 30, offset + 30 + nameLength);
    const start = offset + 30 + nameLength + extraLength;
    const data = buf.subarray(start, start + compressed);
    if (name === "word/document.xml") {
      return (method === 8 ? inflateRawSync(data) : data).toString("utf8");
    }
    offset = start + compressed;
  }
  throw new Error("word/document.xml not found");
}
const META = { updatedAt: new Date("2026-09-03T12:00:00Z"), author: "Chris Adams" };

describe("guide export", () => {
  it("names the file after the title", () => {
    expect(exportFilename("How to correct an email address", "pdf")).toBe(
      "how-to-correct-an-email-address.pdf",
    );
    expect(exportFilename("???", "md")).toBe("untitled.md");
  });

  it("formats the byline", () => {
    expect(metaLine(META)).toBe("Last edited Sep 3, 2026 by Chris Adams");
  });

  it("writes Markdown that opens with the title, byline, a rule, then every block", async () => {
    const blob = await guideToBlob("md", {
      title: "Fix an email",
      blocks: parse([...TEXT_BLOCKS, DIAGRAM, ...MEDIA]),
      ...META,
    });
    expect(blob.type).toContain("text/markdown");
    const md = await blob.text();
    expect(
      md.startsWith("# Fix an email\n\n*Last edited Sep 3, 2026 by Chris Adams*\n\n***\n\n## Steps"),
    ).toBe(true);
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
      ...META,
    });
    expect(blob.size).toBeGreaterThan(1000);
    // A .docx is a zip: "PK" signature.
    const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
    expect(Array.from(head)).toEqual([0x50, 0x4b]);
    // Byline present, at 10pt (docx sizes are half-points) in grey.
    const xml = await documentXml(blob);
    expect(xml).toContain("Last edited Sep 3, 2026 by Chris Adams");
    expect(xml).toMatch(/<w:sz w:val="20"\/>/);
    expect(xml).toMatch(/<w:color w:val="6b7b81"\/>/i);
  });

  it("writes Typst for the PDF with metadata, footer, title, byline and every text block", async () => {
    const typst = await guideToTypst({
      title: 'Fix an "email"',
      blocks: parse(TEXT_BLOCKS),
      ...META,
    });
    // PDF metadata and language (both needed for the PDF/UA-1 claim), and
    // the running footer with a page counter. Quotes in the title are escaped.
    expect(typst).toContain('#set document(title: "Fix an \\"email\\"", author: "Chris Adams")');
    expect(typst).toMatch(/#set text\(.*lang: "en"\)/);
    expect(typst).toContain(
      'footer: [#align(center)[#text(size: 9pt, fill: rgb("#6b7b81"))[#context [#"Fix an \\"email\\"" · Page #counter(page).display() of #counter(page).final().first()]]]]',
    );
    // Body opens with the title as H1, the 10pt grey byline, then the rule.
    const body = typst.slice(typst.indexOf("#heading(level: 1"));
    expect(body).toContain('#heading(level: 1, outlined: true)[#"Fix an \\"email\\""]');
    expect(body).toContain(
      '#text(size: 10pt, fill: rgb("#6b7b81"))[#"Last edited Sep 3, 2026 by Chris Adams"]',
    );
    expect(body.indexOf("Last edited")).toBeLessThan(body.indexOf("#line(length: 100%"));
    // Every text block made it through the default mappings.
    expect(body).toContain('#heading(level: 2, outlined: true)[#"Steps"]');
    expect(body).toContain('#strong("Contacts")');
    expect(body).toContain('#link("https://example.org/mp")[#"in MP"]');
    expect(body).toContain("#list(");
    expect(body).toContain("#enum(\n  start: 3,");
    expect(body).toContain("#list(marker: _cb-checked");
    expect(body).toContain('#quote(block: true)[#"Be kind."]');
    expect(body).toContain('#raw("select 1;", block: true, lang: "sql")');
    expect(body).toContain("#table(");
    expect(body).toContain('#strong[#"Field"]');
  });
});
