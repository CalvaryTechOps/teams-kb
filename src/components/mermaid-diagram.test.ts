// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { defaultMermaidOptions } from "@blocknote/diagram-block";
import { MERMAID_LABEL_OPTIONS } from "./mermaid-diagram";

// Mermaid's config is page-global and `initialize` replaces it wholesale, so
// the guide page's own initialize must agree with the diagram block's
// exporters on label rendering (SVG text, not foreignObject HTML) or exported
// diagrams lose their labels. The page copies the options instead of importing
// them to keep the editor packages out of its bundle; this pins the copy.

describe("MermaidDiagram", () => {
  it("initializes Mermaid with the diagram block's label options", () => {
    expect(MERMAID_LABEL_OPTIONS).toEqual(defaultMermaidOptions);
  });
});
