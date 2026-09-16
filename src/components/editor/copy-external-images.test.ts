import { describe, expect, it, vi } from "vitest";
import { copyExternalImages, summarize, type CopyProgress } from "./copy-external-images";

const STORE = "https://store.public.blob.vercel-storage.com/guides";

/** A fetch stub answering /api/upload/import per source URL. */
function fakeFetch(answers: Record<string, { status: number; body: unknown } | Error>) {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const { url } = JSON.parse(String(init?.body)) as { url: string };
    const answer = answers[url];
    if (!answer) throw new Error(`unexpected url ${url}`);
    if (answer instanceof Error) throw answer;
    return new Response(JSON.stringify(answer.body), { status: answer.status });
  }) as unknown as typeof fetch;
}

describe("copyExternalImages", () => {
  it("copies each distinct URL once, rewrites every block that used it and reports progress", async () => {
    const rewrite = vi.fn();
    const progress: CopyProgress[] = [];
    const fetch = fakeFetch({
      "https://old.example/a.png": { status: 200, body: { url: `${STORE}/1.png` } },
      "https://old.example/b.png": { status: 200, body: { url: `${STORE}/2.png` } },
    });

    const result = await copyExternalImages(
      [
        { id: "x", url: "https://old.example/a.png" },
        { id: "y", url: "https://old.example/b.png" },
        { id: "z", url: "https://old.example/a.png" },
      ],
      { rewrite, report: (p) => progress.push(p), fetch },
    );

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(rewrite.mock.calls).toEqual([
      ["x", `${STORE}/1.png`],
      ["z", `${STORE}/1.png`],
      ["y", `${STORE}/2.png`],
    ]);
    expect(result).toEqual({ copied: 2, total: 2, failures: [] });
    expect(progress).toEqual([
      { busy: true, message: "Copying 1 of 2…" },
      { busy: true, message: "Copying 2 of 2…" },
      { busy: false, message: "Copied 2 images to this site." },
    ]);
  });

  it("keeps going after a failure and surfaces the server's reason", async () => {
    const rewrite = vi.fn();
    const progress: CopyProgress[] = [];
    const fetch = fakeFetch({
      "https://old.example/logo": { status: 400, body: { error: "SVG images can't be copied." } },
      "https://old.example/b.png": { status: 200, body: { url: `${STORE}/2.png` } },
      "https://down.example/c.png": new TypeError("network"),
    });

    const result = await copyExternalImages(
      [
        { id: "x", url: "https://old.example/logo" },
        { id: "y", url: "https://old.example/b.png" },
        { id: "w", url: "https://down.example/c.png" },
      ],
      { rewrite, report: (p) => progress.push(p), fetch },
    );

    expect(rewrite.mock.calls).toEqual([["y", `${STORE}/2.png`]]);
    expect(result).toEqual({
      copied: 1,
      total: 3,
      failures: ["SVG images can't be copied.", "Couldn't reach the upload service."],
    });
    expect(progress.at(-1)).toEqual({
      busy: false,
      message:
        "Copied 1 of 3 images. 2 couldn't be copied: SVG images can't be copied. Couldn't reach the upload service.",
    });
  });

  it("treats a non-JSON or url-less success as a failure", async () => {
    const htmlFetch = vi.fn(async () => new Response("<html>", { status: 200 })) as unknown as typeof globalThis.fetch;
    const result = await copyExternalImages([{ id: "x", url: "https://old.example/a.png" }], {
      rewrite: vi.fn(),
      report: vi.fn(),
      fetch: htmlFetch,
    });
    expect(result.failures).toEqual(["Couldn't copy the image."]);
  });

  it("still counts a copy whose block vanished before the rewrite", async () => {
    const fetch = fakeFetch({
      "https://old.example/a.png": { status: 200, body: { url: `${STORE}/1.png` } },
    });
    const result = await copyExternalImages([{ id: "gone", url: "https://old.example/a.png" }], {
      rewrite: () => {
        throw new Error("Block not found");
      },
      report: vi.fn(),
      fetch,
    });
    expect(result).toEqual({ copied: 1, total: 1, failures: [] });
  });
});

describe("summarize", () => {
  it("pluralises and dedupes reasons", () => {
    expect(summarize(1, 1, [])).toBe("Copied 1 image to this site.");
    expect(summarize(0, 1, ["Nope."])).toBe("Copied 0 of 1 image. 1 couldn't be copied: Nope.");
    expect(summarize(1, 3, ["Nope.", "Nope."])).toBe("Copied 1 of 3 images. 2 couldn't be copied: Nope.");
  });
});
