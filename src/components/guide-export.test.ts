// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { parseGuideContent } from "@/lib/guide-content";
import { exportFilename, guideToBlob, metaLine } from "./guide-export";

// Conversion contract for the DOCX download, which runs headless here. The
// diagram rendering and image fetching need a real browser and are covered
// by the manual test in plans/remove-pdf-markdown-export.md, step 7.

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

// Every block type the editor can produce, except media and diagrams: DOCX
// would fetch the image and rasterize the diagram, which needs a browser.
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
    expect(exportFilename("How to correct an email address", "docx")).toBe(
      "how-to-correct-an-email-address.docx",
    );
    expect(exportFilename("???", "docx")).toBe("untitled.docx");
  });

  it("formats the byline", () => {
    expect(metaLine(META)).toBe("Last edited Sep 3, 2026 by Chris Adams");
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
});
