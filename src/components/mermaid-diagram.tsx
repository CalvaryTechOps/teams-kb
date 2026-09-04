"use client";

import { useEffect, useId, useState } from "react";

// Diagram blocks store Mermaid source; Mermaid needs a browser to lay out and
// render, so this is the one part of a guide body that renders client-side.
// The source shows as a code block until the SVG is ready (and stays if the
// diagram is invalid), so the page is never blank without JavaScript.

export function MermaidDiagram({ source }: { source: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Mermaid puts this id on the rendered <svg>, so it must be unique per
  // diagram on the page and start with a letter.
  const id = "d" + useId().replace(/[^a-zA-Z0-9]/g, "");

  useEffect(() => {
    let stale = false;
    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          suppressErrorRendering: true,
          securityLevel: "strict",
          theme: "neutral",
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
  }, [source, id]);

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
