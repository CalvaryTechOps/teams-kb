import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseGuideContent } from "@/lib/guide-content";
import { GuideContent } from "./guide-content";

// The server renderer is the only path from stored blocks to HTML, so these
// pin the markup contract .prose-guide styles against — and that nothing a
// tampered document could carry (scripts, javascript: URLs) ever reaches it.

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

function render(blocks: unknown[]): string {
  const parsed = parseGuideContent(JSON.stringify(blocks));
  return renderToStaticMarkup(React.createElement(GuideContent, { blocks: parsed }));
}

describe("GuideContent", () => {
  it("groups consecutive list items into one list and nests children", () => {
    const html = render([
      block("bulletListItem", {}, [text("a")], [block("bulletListItem", {}, [text("a.1")])]),
      block("bulletListItem", {}, [text("b")]),
      block("numberedListItem", { start: 3 }, [text("three")]),
      block("numberedListItem", {}, [text("four")]),
      block("checkListItem", { checked: true }, [text("done")]),
      block("checkListItem", {}, [text("todo")]),
    ]);
    expect(html.match(/<ul/g)).toHaveLength(3); // outer, nested, checklist
    expect(html).toContain("<li>a<ul><li>a.1</li></ul></li>");
    expect(html).toContain('<ol start="3"><li>three</li><li>four</li></ol>');
    expect(html).toContain('<ul class="checklist">');
    expect(html).toContain('<input type="checkbox" disabled="" checked=""/><span class="checked">done</span>');
    expect(html).toContain('<input type="checkbox" disabled=""/><span>todo</span>');
  });

  it("renders headings 1:1 with deduped anchor ids", () => {
    const html = render([
      block("heading", { level: 1 }, [text("Setup")]),
      block("heading", { level: 2 }, [text("Setup")]),
      block("heading", { level: 3 }, [text("Détails & more")]),
    ]);
    expect(html).toContain('<h1 id="setup">Setup</h1>');
    expect(html).toContain('<h2 id="setup-2">Setup</h2>');
    expect(html).toContain('<h3 id="details-more">Détails &amp; more</h3>');
  });

  it("renders toggle headings and toggle list items as <details>", () => {
    const html = render([
      block("heading", { level: 2, isToggleable: true }, [text("FAQ")], [
        block("paragraph", {}, [text("answer")]),
      ]),
      block("toggleListItem", {}, [text("More")], [block("paragraph", {}, [text("inside")])]),
    ]);
    expect(html).toContain(
      '<details class="toggle"><summary><h2 id="faq">FAQ</h2></summary><div class="prose-nested"><p>answer</p></div></details>',
    );
    expect(html).toContain(
      '<details class="toggle"><summary>More</summary><div class="prose-nested"><p>inside</p></div></details>',
    );
  });

  it("renders tables with header rows, header columns and spans", () => {
    const html = render([
      block("table", {}, {
        type: "tableContent",
        columnWidths: [null, null],
        headerRows: 1,
        headerCols: 1,
        rows: [
          { cells: [[text("Name")], [text("Role")]] },
          { cells: [[text("Ada")], [text("Owner")]] },
          {
            cells: [
              {
                type: "tableCell",
                props: { colspan: 2, backgroundColor: "yellow", textAlignment: "center" },
                content: [text("Everyone")],
              },
            ],
          },
        ],
      }),
    ]);
    expect(html).toContain("<thead><tr><th>Name</th><th>Role</th></tr></thead>");
    expect(html).toContain("<tbody><tr><th>Ada</th><td>Owner</td></tr>");
    expect(html).toContain(
      '<th colSpan="2" style="background-color:#fbf3db;text-align:center">Everyone</th>',
    );
  });

  it("renders media as figures with captions, or as links without preview", () => {
    const html = render([
      block("image", {
        url: "https://blob.example.com/a.png",
        caption: "A screenshot",
        previewWidth: 320,
        textAlignment: "center",
      }),
      block("video", { url: "https://blob.example.com/v.mp4", caption: "Walkthrough" }),
      block("audio", { url: "https://blob.example.com/a.mp3" }),
      block("image", { url: "https://blob.example.com/b.png", name: "b.png", showPreview: false }),
      block("image", { url: "" }),
    ]);
    expect(html).toContain(
      '<figure class="media-image" style="align-items:center"><img src="https://blob.example.com/a.png" alt="A screenshot" style="width:320px"/><figcaption>A screenshot</figcaption></figure>',
    );
    expect(html).toContain('<video controls="" preload="metadata" src="https://blob.example.com/v.mp4"></video><figcaption>Walkthrough</figcaption>');
    expect(html).toContain('<audio controls="" preload="metadata" src="https://blob.example.com/a.mp3"></audio>');
    expect(html).toContain(
      '<a href="https://blob.example.com/b.png" target="_blank" rel="noopener noreferrer">b.png</a>',
    );
    // The unfilled image block renders nothing.
    expect(html.match(/<figure/g)).toHaveLength(4);
  });

  it("nests inline styles, honours colors and alignment, and marks external links", () => {
    const html = render([
      block("paragraph", { textAlignment: "right", backgroundColor: "gray" }, [
        text("bi", { bold: true, italic: true }),
        text(" "),
        text("u", { underline: true }),
        text("s", { strike: true }),
        text("c", { code: true }),
        text("red", { textColor: "red" }),
        { type: "link", href: "https://example.com", content: [text("out")] },
        { type: "link", href: "/spaces/x", content: [text("in")] },
      ]),
    ]);
    expect(html).toContain('<p style="background-color:#ebeced;text-align:right">');
    expect(html).toContain("<strong><em>bi</em></strong>");
    expect(html).toContain("<u>u</u><s>s</s><code>c</code>");
    expect(html).toContain('<span style="color:#e03e3e">red</span>');
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">out</a>');
    expect(html).toContain('<a href="/spaces/x">in</a>');
  });

  it("renders quotes, dividers, code blocks and line breaks", () => {
    const html = render([
      block("quote", { textColor: "blue" }, [text("wise")]),
      block("divider"),
      block("codeBlock", { language: "bash" }, [text("npm run dev\nnpm test")]),
      block("codeBlock", { language: "text" }, [text("plain")]),
      block("paragraph", {}, [text("line one\nline two")]),
    ]);
    expect(html).toContain('<blockquote style="color:#0b6e99">wise</blockquote>');
    expect(html).toContain("<hr/>");
    expect(html).toContain('<pre><code class="language-bash">npm run dev\nnpm test</code></pre>');
    expect(html).toContain("<pre><code>plain</code></pre>");
    expect(html).toContain("<p>line one<br/>line two</p>");
  });

  it("server-renders a diagram's source until Mermaid draws it client-side", () => {
    const html = render([block("diagram", {}, [text("graph TD\n  A --> B")])]);
    expect(html).toContain('<figure class="guide-diagram-source"><pre><code class="language-mermaid">graph TD\n  A --&gt; B</code></pre></figure>');
  });

  it("keeps empty paragraphs as spacing but drops the trailing one", () => {
    const html = render([
      block("paragraph", {}, [text("a")]),
      block("paragraph"),
      block("paragraph", {}, [text("b")]),
      block("paragraph"),
    ]);
    expect(html).toBe("<p>a</p><p>\u00a0</p><p>b</p>");
  });

  it("never emits scripts or unsafe URLs from a tampered document", () => {
    const html = render([
      block("paragraph", {}, [
        text("<script>alert(1)</script>"),
        { type: "link", href: "javascript:alert(1)", content: [text("x")] },
      ]),
      block("image", { url: "javascript:alert(1)", caption: "<img onerror=x>" }),
    ]);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<img");
  });
});
