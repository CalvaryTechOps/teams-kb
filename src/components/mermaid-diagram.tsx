"use client";

import type { MermaidConfig } from "mermaid";
import { useEffect, useId, useState } from "react";
import { useThemeMode } from "@/components/theme-provider";

// Diagram blocks store Mermaid source; Mermaid needs a browser to lay out and
// render, so this is the one part of a guide body that renders client-side.
// The source shows as a code block until the SVG is ready (and stays if the
// diagram is invalid), so the page is never blank without JavaScript.

/**
 * Labels as SVG text, not Mermaid's default HTML-in-`<foreignObject>` labels.
 * Mermaid's config is page-global and `initialize` replaces it wholesale, so
 * this page's call must agree with the exporters on this point: the PDF
 * export embeds the SVG in Typst, whose renderer drops foreign objects (the
 * labels vanish), and Safari refuses to draw foreignObject SVGs to the canvas
 * the DOCX export rasterizes with. Mirrors `defaultMermaidOptions` from
 * @blocknote/diagram-block — copied rather than imported so the guide page
 * does not pull the editor packages in; mermaid-diagram.test.ts keeps the two
 * in sync. Raw HTML inside a label shows as literal tags this way, matching
 * the editor preview. (The cast, as in the library: `MermaidConfig` does not
 * declare `htmlLabels` for every diagram type that honours it at runtime.)
 */
export const MERMAID_LABEL_OPTIONS = {
  htmlLabels: false,
  flowchart: { htmlLabels: false },
  class: { htmlLabels: false },
  state: { htmlLabels: false },
  er: { htmlLabels: false },
} as MermaidConfig;

export function MermaidDiagram({ source }: { source: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Mermaid puts this id on the rendered <svg>, so it must be unique per
  // diagram on the page and start with a letter.
  const id = "d" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const { mode } = useThemeMode();

  useEffect(() => {
    let stale = false;
    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          ...MERMAID_LABEL_OPTIONS,
          startOnLoad: false,
          suppressErrorRendering: true,
          securityLevel: "strict",
          theme: mode === "dark" ? "dark" : "neutral",
          fontFamily: "inherit",
        });
        await mermaid.parse(source);
        const rendered = await mermaid.render(id, source);
        if (!stale) {
          setSvg(rendered.svg);
          setError(null);
        }
      } catch (err) {
        if (!stale) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      stale = true;
    };
  }, [source, id, mode]);

  if (svg) {
    return (
      <div
        className="guide-diagram"
        role="img"
        aria-label="Diagram"
        // Mermaid's own SVG output; with securityLevel "strict" it sanitizes
        // label text itself, and the source was authored in-house.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }
  return (
    <figure className="guide-diagram-source">
      <pre>
        <code className="language-mermaid">{source}</code>
      </pre>
      {error && <figcaption>Diagram could not be rendered: {error}</figcaption>}
    </figure>
  );
}
