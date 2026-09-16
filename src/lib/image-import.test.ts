import { describe, expect, it, vi } from "vitest";
import {
  IMAGE_TYPES_MESSAGE,
  ImageImportError,
  checkSourceUrl,
  importImage,
  isBlockedHost,
  type ImageImportDeps,
} from "./image-import";
import { UPLOAD_KINDS } from "./uploads";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 0, 0, 0, 0, 0]);

/** A Response whose body streams `chunks` in order. */
function streamed(
  chunks: Uint8Array[],
  init: { status?: number; headers?: Record<string, string>; url?: string } = {},
): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
  const res = new Response(body, { status: init.status ?? 200, headers: init.headers });
  if (init.url) Object.defineProperty(res, "url", { value: init.url });
  return res;
}

function deps(response: Response | (() => Promise<Response>)): ImageImportDeps & {
  put: ReturnType<typeof vi.fn>;
  fetch: ReturnType<typeof vi.fn>;
} {
  const fetchMock = vi.fn(typeof response === "function" ? response : async () => response);
  const put = vi.fn(async (pathname: string) => ({ url: `https://store.public.blob.vercel-storage.com/${pathname}` }));
  return { fetch: fetchMock as unknown as typeof fetch, put, randomUUID: () => "0000-uuid" } as never;
}

async function failure(p: Promise<unknown>): Promise<ImageImportError> {
  try {
    await p;
  } catch (err) {
    if (err instanceof ImageImportError) return err;
    throw err;
  }
  throw new Error("expected importImage to reject");
}

describe("isBlockedHost", () => {
  it("blocks loopback, private, link-local and internal names", () => {
    for (const h of [
      "localhost",
      "LOCALHOST",
      "foo.localhost",
      "printer.local",
      "db.internal",
      "nas.home.arpa",
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.9",
      "172.31.255.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "[::1]",
      "[fd00::1]",
      "[fe80::1]",
      "[::ffff:10.0.0.1]",
    ]) {
      expect(isBlockedHost(h), h).toBe(true);
    }
  });

  it("allows public names and addresses", () => {
    for (const h of ["old-kb.example.com", "8.8.8.8", "172.32.0.1", "172.15.0.1", "[2606:4700::1111]"]) {
      expect(isBlockedHost(h), h).toBe(false);
    }
  });
});

describe("checkSourceUrl", () => {
  it("rejects non-http schemes, credentials, private hosts and junk", () => {
    expect(() => checkSourceUrl("ftp://a.example/x.png")).toThrow(/http/);
    expect(() => checkSourceUrl("data:image/png;base64,AAAA")).toThrow(/http/);
    expect(() => checkSourceUrl("https://user:pw@a.example/x.png")).toThrow(/login/);
    expect(() => checkSourceUrl("http://192.168.0.5/x.png")).toThrow(/private network/);
    expect(() => checkSourceUrl("nope")).toThrow(/valid image address/);
  });

  it("returns the parsed URL for a public http(s) address", () => {
    expect(checkSourceUrl("https://old-kb.example.com/a.png").hostname).toBe("old-kb.example.com");
    expect(checkSourceUrl("http://old-kb.example.com/a.png").protocol).toBe("http:");
  });
});

describe("importImage", () => {
  it("stores an image announced by content-type under the upload pathname", async () => {
    const d = deps(streamed([PNG], { headers: { "content-type": "image/png" } }));
    const result = await importImage("https://old-kb.example.com/a.png", d);
    expect(result.url).toBe("https://store.public.blob.vercel-storage.com/guides/0000-uuid.png");
    expect(d.put).toHaveBeenCalledWith("guides/0000-uuid.png", expect.any(Uint8Array), "image/png");
    expect(d.fetch).toHaveBeenCalledTimes(1);
    expect(d.fetch.mock.calls[0]![1]).toMatchObject({ redirect: "follow" });
  });

  it("sniffs the type when the server sends octet-stream, and trusts the bytes over the header", async () => {
    const sniffed = deps(streamed([JPEG], { headers: { "content-type": "application/octet-stream" } }));
    await importImage("https://old-kb.example.com/download?id=7", sniffed);
    expect(sniffed.put).toHaveBeenCalledWith("guides/0000-uuid.jpg", expect.any(Uint8Array), "image/jpeg");

    const lying = deps(streamed([JPEG], { headers: { "content-type": "image/png" } }));
    await importImage("https://old-kb.example.com/a.png", lying);
    expect(lying.put).toHaveBeenCalledWith("guides/0000-uuid.jpg", expect.any(Uint8Array), "image/jpeg");
  });

  it("reassembles a chunked body before storing it", async () => {
    const d = deps(streamed([PNG.subarray(0, 5), PNG.subarray(5)], { headers: { "content-type": "image/png" } }));
    await importImage("https://old-kb.example.com/a.png", d);
    const stored = d.put.mock.calls[0]![1] as Uint8Array;
    expect(Array.from(stored)).toEqual(Array.from(PNG));
  });

  it("refuses non-image content without reading the body", async () => {
    const d = deps(streamed([new TextEncoder().encode("<html>login</html>")], { headers: { "content-type": "text/html; charset=utf-8" } }));
    const err = await failure(importImage("https://old-kb.example.com/a.png", d));
    expect(err.message).toBe(IMAGE_TYPES_MESSAGE);
    expect(err.status).toBe(400);
    expect(d.put).not.toHaveBeenCalled();
  });

  it("refuses SVG by header and by bytes", async () => {
    const byHeader = deps(streamed([new TextEncoder().encode("<svg/>")], { headers: { "content-type": "image/svg+xml" } }));
    expect((await failure(importImage("https://old-kb.example.com/logo", byHeader))).message).toMatch(/SVG/);

    const byBytes = deps(streamed([new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")], { headers: { "content-type": "application/octet-stream" } }));
    expect((await failure(importImage("https://old-kb.example.com/logo", byBytes))).message).toBe(IMAGE_TYPES_MESSAGE);
    expect(byBytes.put).not.toHaveBeenCalled();
  });

  it("refuses by content-length before reading, and by actual size while reading", async () => {
    const max = UPLOAD_KINDS.image.maxBytes;
    const declared = deps(streamed([PNG], { headers: { "content-type": "image/png", "content-length": String(max + 1) } }));
    expect((await failure(importImage("https://old-kb.example.com/big.png", declared))).message).toMatch(/10 MB or smaller/);

    const big = new Uint8Array(max + 1);
    big.set(PNG);
    const actual = deps(streamed([big.subarray(0, max), big.subarray(max)], { headers: { "content-type": "image/png" } }));
    expect((await failure(importImage("https://old-kb.example.com/big.png", actual))).message).toMatch(/10 MB or smaller/);
    expect(actual.put).not.toHaveBeenCalled();
  });

  it("reports the other site's status and unreachable hosts as 502", async () => {
    const notFound = deps(streamed([], { status: 404, headers: { "content-type": "image/png" } }));
    const nf = await failure(importImage("https://old-kb.example.com/gone.png", notFound));
    expect(nf.message).toBe("The other site returned 404.");
    expect(nf.status).toBe(502);

    const down = deps(async () => {
      throw new TypeError("fetch failed");
    });
    const d = await failure(importImage("https://old-kb.example.com/a.png", down));
    expect(d.message).toMatch(/couldn't be reached/);
    expect(d.status).toBe(502);

    const slow = deps(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    expect((await failure(importImage("https://old-kb.example.com/a.png", slow))).message).toMatch(/too long/);
  });

  it("refuses when a redirect lands on a private host", async () => {
    const d = deps(streamed([PNG], { headers: { "content-type": "image/png" }, url: "http://10.0.0.7/internal.png" }));
    expect((await failure(importImage("https://old-kb.example.com/a.png", d))).message).toMatch(/private network/);
    expect(d.put).not.toHaveBeenCalled();
  });

  it("never fetches a blocked source", async () => {
    const d = deps(streamed([PNG]));
    await failure(importImage("http://127.0.0.1:3000/api/upload", d));
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it("treats an empty body as the other site's fault", async () => {
    const d = deps(streamed([], { headers: { "content-type": "image/png" } }));
    const err = await failure(importImage("https://old-kb.example.com/a.png", d));
    expect(err.message).toMatch(/empty file/);
    expect(err.status).toBe(502);
  });
});
