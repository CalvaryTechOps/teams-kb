import { describe, expect, it } from "vitest";
import {
  externalImageBlocks,
  isOwnBlobUrl,
  looksLikeSvgUrl,
  sniffImageType,
  type BlockLike,
} from "./external-media";

const OWN = "https://abc123xyz.public.blob.vercel-storage.com/guides/1.png";

let counter = 0;
const block = (
  type: string,
  props: Record<string, unknown> = {},
  children: BlockLike[] = [],
): BlockLike => ({ id: `b${++counter}`, type, props, children });

describe("isOwnBlobUrl", () => {
  it("recognises our Blob store", () => {
    expect(isOwnBlobUrl(OWN)).toBe(true);
  });

  it("rejects look-alikes, other hosts, http and junk", () => {
    expect(isOwnBlobUrl("https://evil.example/x.public.blob.vercel-storage.com/a.png")).toBe(false);
    expect(isOwnBlobUrl("https://evil.example/?h=.public.blob.vercel-storage.com")).toBe(false);
    expect(isOwnBlobUrl("https://cdn.example.com/a.png")).toBe(false);
    expect(isOwnBlobUrl("http://abc.public.blob.vercel-storage.com/a.png")).toBe(false);
    expect(isOwnBlobUrl("not a url")).toBe(false);
    expect(isOwnBlobUrl("")).toBe(false);
  });
});

describe("looksLikeSvgUrl", () => {
  it("judges by the path extension only", () => {
    expect(looksLikeSvgUrl("https://a.example/logo.svg")).toBe(true);
    expect(looksLikeSvgUrl("https://a.example/logo.SVG?v=2")).toBe(true);
    expect(looksLikeSvgUrl("https://a.example/logo.png?name=x.svg")).toBe(false);
    expect(looksLikeSvgUrl("https://a.example/svg/logo.png")).toBe(false);
    expect(looksLikeSvgUrl("nope")).toBe(false);
  });
});

describe("externalImageBlocks", () => {
  it("returns external images at any depth, in document order", () => {
    const nested = block("image", { url: "https://old.example/b.png" });
    const doc = [
      block("paragraph"),
      block("image", { url: "https://old.example/a.png", previewWidth: 320 }),
      block("bulletListItem", {}, [block("paragraph", {}, [nested])]),
      block("image", { url: OWN }),
      block("image", { url: "" }),
      block("video", { url: "https://old.example/c.mp4" }),
      block("image", { url: "https://old.example/logo.svg" }),
      block("image", { url: "ftp://old.example/d.png" }),
    ];
    expect(externalImageBlocks(doc)).toEqual([
      { id: doc[1]!.id, url: "https://old.example/a.png" },
      { id: nested.id, url: "https://old.example/b.png" },
    ]);
  });

  it("is empty when every image is ours", () => {
    expect(externalImageBlocks([block("image", { url: OWN })])).toEqual([]);
    expect(externalImageBlocks([])).toEqual([]);
  });

  it("tolerates blocks without props or children", () => {
    expect(externalImageBlocks([{ id: "x", type: "image" }, { id: "y", type: "divider" }])).toEqual([]);
  });
});

describe("sniffImageType", () => {
  const bytes = (...parts: (number | string)[]) =>
    new Uint8Array(
      parts.flatMap((p) =>
        typeof p === "number" ? [p] : Array.from(p, (c) => c.charCodeAt(0)),
      ),
    );

  it("recognises the four allowed formats", () => {
    expect(sniffImageType(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0))).toBe("image/png");
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe("image/jpeg");
    expect(sniffImageType(bytes("GIF89a", 0, 0))).toBe("image/gif");
    expect(sniffImageType(bytes("GIF87a"))).toBe("image/gif");
    expect(sniffImageType(bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 "))).toBe("image/webp");
  });

  it("returns undefined for anything else", () => {
    expect(sniffImageType(bytes("<svg xmlns=..."))).toBeUndefined();
    expect(sniffImageType(bytes("<!doctype html>"))).toBeUndefined();
    expect(sniffImageType(bytes("RIFF", 0, 0, 0, 0, "WAVE"))).toBeUndefined();
    expect(sniffImageType(bytes("RIFF"))).toBeUndefined();
    expect(sniffImageType(new Uint8Array())).toBeUndefined();
  });
});
