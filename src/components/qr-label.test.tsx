// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseQrLabelSize, QrLabel, QR_LABEL_SIZES } from "./qr-label";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29"><path d="M0 0h1v1H0z"/></svg>';

describe("QrLabel", () => {
  it("prints the code, title, department, caption, typed URL and app title", () => {
    const html = renderToStaticMarkup(
      <QrLabel
        svg={SVG}
        title="Reset a badge"
        spaceName="Facilities"
        url="https://kb.example.com/a/7kq4x"
        caption="Scan for the how-to"
        appTitle="Knowledge base"
        size="md"
      />,
    );
    expect(html).toContain("<svg");
    expect(html).toContain("Reset a badge");
    expect(html).toContain("Facilities");
    expect(html).toContain("Scan for the how-to");
    // Scheme dropped: it's for typing, and the QR carries the full URL.
    expect(html).toContain("kb.example.com/a/7kq4x");
    expect(html).not.toContain("https://kb.example.com");
    expect(html).toContain("Knowledge base");
    expect(html).toContain(`width:${QR_LABEL_SIZES.md.width}`);
  });
});

describe("parseQrLabelSize", () => {
  it("accepts the known sizes and falls back to medium", () => {
    expect(parseQrLabelSize("sm")).toBe("sm");
    expect(parseQrLabelSize("lg")).toBe("lg");
    expect(parseQrLabelSize("huge")).toBe("md");
    expect(parseQrLabelSize(undefined)).toBe("md");
    expect(parseQrLabelSize(["sm"])).toBe("md");
  });
});
