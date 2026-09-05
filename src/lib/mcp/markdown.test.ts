import { describe, expect, it } from "vitest";
import {
  markdownToGuideContent,
  mermaidFencesToDiagrams,
  shapeParsedBlocks,
  stripDuplicateTitleHeading,
} from "./markdown";

const text = (t: string) => [{ type: "text", text: t, styles: {} }];
const paragraph = (t: string, id = "p1") => ({
  id,
  type: "paragraph",
  props: {},
  content: text(t),
  children: [],
});
const heading = (t: string, level: number, id = "h1") => ({
  id,
  type: "heading",
  props: { level },
  content: text(t),
  children: [],
});
const code = (language: string, src: string, id = "c1") => ({
  id,
  type: "codeBlock",
  props: { language },
  content: text(src),
  children: [],
});

describe("mermaidFencesToDiagrams", () => {
  it("rewrites mermaid code blocks, including nested ones, and leaves others", () => {
    const out = mermaidFencesToDiagrams([
      code("Mermaid ", "graph TD; A-->B;"),
      { ...paragraph("list"), type: "bulletListItem", children: [code("mermaid", "pie", "c2")] },
      code("js", "1"),
    ]) as Array<{ type: string; props: unknown; children: Array<{ type: string }> }>;
    expect(out[0]!.type).toBe("diagram");
    expect(out[0]!.props).toEqual({});
    expect(out[1]!.children[0]!.type).toBe("diagram");
    expect(out[2]!.type).toBe("codeBlock");
  });
});

describe("stripDuplicateTitleHeading", () => {
  it("drops a leading H1 equal to the title, ignoring case and spacing", () => {
    const blocks = [heading("  Reset a   Badge ", 1), paragraph("body")];
    expect(stripDuplicateTitleHeading(blocks, "reset a badge")).toEqual([paragraph("body")]);
  });

  it("keeps a different heading, a lower level, or a non-leading one", () => {
    expect(stripDuplicateTitleHeading([heading("Other", 1), paragraph("b")], "Title")).toHaveLength(2);
    expect(stripDuplicateTitleHeading([heading("Title", 2), paragraph("b")], "Title")).toHaveLength(2);
    expect(stripDuplicateTitleHeading([paragraph("b"), heading("Title", 1)], "Title")).toHaveLength(2);
    expect(stripDuplicateTitleHeading([], "Title")).toEqual([]);
  });
});

describe("shapeParsedBlocks", () => {
  it("validates through the app's content gate", () => {
    const r = shapeParsedBlocks([heading("Title", 1), code("mermaid", "graph TD"), paragraph("x")], "Title");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.content.map((b) => b.type)).toEqual(["diagram", "paragraph"]);
  });

  it("refuses a document that is empty after shaping", () => {
    expect(shapeParsedBlocks([heading("Title", 1)], "Title")).toEqual({
      ok: false,
      error: "The Markdown produced no content.",
    });
    expect(shapeParsedBlocks([paragraph("   ")], "Title").ok).toBe(false);
  });

  it("reports structurally invalid blocks instead of throwing", () => {
    const r = shapeParsedBlocks([{ id: "x", type: "unknownBlock", children: [] }], "T");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/could not be converted/);
  });
});

describe("markdownToGuideContent", () => {
  const sample = `# Reset a badge

Some **bold**, *italic*, ~~strike~~, \`code\`, a [link](https://example.com) and [bad](javascript:alert(1)).

## Steps

1. First
2. Second
   - nested

- [ ] todo
- [x] done

> quote

\`\`\`mermaid
graph TD; A-->B;
\`\`\`

\`\`\`js
console.log(1)
\`\`\`

| a | b |
|---|---|
| 1 | 2 |

![alt](https://example.com/img.png)

<script>alert(1)</script>

---
`;

  it("converts the common Markdown constructs into valid guide blocks", async () => {
    const r = await markdownToGuideContent(sample, "Reset a badge");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const types = r.content.map((b) => b.type);
    // Title heading stripped; everything else in order.
    expect(types[0]).toBe("paragraph");
    expect(types).toEqual(
      expect.arrayContaining([
        "heading",
        "numberedListItem",
        "checkListItem",
        "quote",
        "diagram",
        "codeBlock",
        "table",
        "image",
        "divider",
      ]),
    );
    expect(types).not.toContain("script");

    const intro = r.content[0]!;
    if (intro.type !== "paragraph") throw new Error("expected paragraph");
    const styles = intro.content.flatMap((c) => (c.type === "text" ? Object.keys(c.styles) : []));
    expect(styles).toEqual(expect.arrayContaining(["bold", "italic", "strike", "code"]));
    const links = intro.content.filter((c) => c.type === "link");
    expect(links).toHaveLength(1);
    expect(links[0]!.type === "link" && links[0]!.href).toBe("https://example.com");
    // The javascript: link is plain words.
    expect(intro.content.some((c) => c.type === "text" && c.text.includes("bad"))).toBe(true);

    const second = r.content.find((b) => b.type === "numberedListItem" && b.children.length > 0);
    expect(second?.children[0]?.type).toBe("bulletListItem");

    const image = r.content.find((b) => b.type === "image");
    expect(image && image.type === "image" && image.props.url).toBe("https://example.com/img.png");

    const diagram = r.content.find((b) => b.type === "diagram");
    expect(diagram && diagram.type === "diagram" && diagram.content[0]?.text).toBe("graph TD; A-->B;");
  });

  it("rejects blank input without parsing", async () => {
    expect(await markdownToGuideContent("  \n\n", "T")).toEqual({
      ok: false,
      error: "The Markdown produced no content.",
    });
  });
});
