// Copy an externally hosted image into our Blob store, server-side. The
// browser can't read another site's image bytes without CORS headers (old
// intranet systems rarely send them), so the copy route fetches the file
// here, checks it against the same rules as browser uploads (src/lib/
// uploads.ts: PNG/JPEG/GIF/WebP, 10 MB) and stores it under the same
// `guides/<uuid>.<ext>` pathname. `fetch` and `put` are injected so the whole
// decision path is unit-tested without network or Blob.
//
// SSRF hygiene: only signed-in authors can reach the route, but it still
// refuses loopback, link-local, private and internal hosts before and after
// redirects. DNS rebinding (a public name resolving to a private address) is
// out of scope for a staff-only tool.

import { sniffImageType } from "@/lib/external-media";
import { UPLOAD_KINDS, formatMegabytes, uploadKindForType } from "@/lib/uploads";

export class ImageImportError extends Error {
  constructor(
    message: string,
    /** HTTP status the route should answer with. */
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "ImageImportError";
  }
}

export const IMAGE_TYPES_MESSAGE = "Only PNG, JPEG, GIF or WebP images can be copied.";

export type ImageImportDeps = {
  fetch?: typeof fetch;
  /** Stores the bytes and returns the public URL (the route binds @vercel/blob's put). */
  put: (pathname: string, bytes: Uint8Array, contentType: string) => Promise<{ url: string }>;
  timeoutMs?: number;
  randomUUID?: () => string;
};

const DEFAULT_TIMEOUT_MS = 20_000;
const USER_AGENT = "TeamsKB-image-import/1 (+https://github.com/CalvaryTechOps/teams-kb)";

/**
 * Hostnames the copy route must never fetch from. Names first, then IPv4 and
 * IPv6 literals in loopback, link-local, private and reserved ranges.
 */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host === "" || host === "localhost" || host.endsWith(".localhost")) return true;
  if (/\.(local|internal|home\.arpa|localdomain)$/.test(host)) return true;

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }

  // URL.hostname keeps IPv6 literals in brackets.
  if (host.startsWith("[")) {
    const v6 = host.slice(1, -1);
    return (
      v6 === "::" ||
      v6 === "::1" ||
      /^f[cd]/.test(v6) || // fc00::/7 unique local
      /^fe[89ab]/.test(v6) || // fe80::/10 link-local
      v6.startsWith("::ffff:") // IPv4-mapped; never legitimate for a public image
    );
  }
  return false;
}

/** Parse and vet a source URL; throws ImageImportError with a plain message. */
export function checkSourceUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ImageImportError("That isn't a valid image address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ImageImportError("Only http(s) images can be copied.");
  }
  if (url.username || url.password) {
    throw new ImageImportError("Image addresses with a login in them can't be copied.");
  }
  if (isBlockedHost(url.hostname)) {
    throw new ImageImportError("That address points inside a private network and can't be copied.");
  }
  return url;
}

/** Header types we read the body for even though they aren't image/*. */
const OPAQUE_TYPES = new Set(["application/octet-stream", "binary/octet-stream", "text/plain", ""]);

/**
 * Fetch `sourceUrl`, make sure it's an allowed image within the size cap and
 * store it. Resolves to the stored URL; rejects with ImageImportError for
 * anything the author can act on, and lets unexpected failures propagate.
 */
export async function importImage(
  sourceUrl: string,
  deps: ImageImportDeps,
): Promise<{ url: string }> {
  const source = checkSourceUrl(sourceUrl);
  const doFetch = deps.fetch ?? fetch;
  const maxBytes = UPLOAD_KINDS.image.maxBytes;

  let response: Response;
  try {
    response = await doFetch(source, {
      redirect: "follow",
      signal: AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      headers: { accept: "image/*,*/*;q=0.5", "user-agent": USER_AGENT },
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new ImageImportError(
      timedOut ? "The other site took too long to respond." : "The other site couldn't be reached.",
      502,
    );
  }

  // Redirects may land anywhere; re-check where we actually ended up.
  if (response.url) checkSourceUrl(response.url);

  if (!response.ok) {
    throw new ImageImportError(`The other site returned ${response.status}.`, 502);
  }

  const headerType = (response.headers.get("content-type") ?? "")
    .split(";")[0]!
    .trim()
    .toLowerCase();
  if (headerType === "image/svg+xml") {
    throw new ImageImportError("SVG images can't be copied.");
  }
  if (!OPAQUE_TYPES.has(headerType) && uploadKindForType(headerType)?.kind !== "image") {
    // Clearly not an image (an HTML login page, JSON, a video); don't bother reading it.
    throw new ImageImportError(IMAGE_TYPES_MESSAGE);
  }

  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ImageImportError(tooLarge(maxBytes));
  }

  const bytes = await readCapped(response, maxBytes);

  // The bytes decide the type, whatever the header claimed.
  const contentType = sniffImageType(bytes.subarray(0, 16));
  const match = contentType ? uploadKindForType(contentType) : undefined;
  if (!contentType || !match || match.kind !== "image") {
    throw new ImageImportError(IMAGE_TYPES_MESSAGE);
  }

  const id = (deps.randomUUID ?? (() => crypto.randomUUID()))();
  return deps.put(`guides/${id}.${match.extension}`, bytes, contentType);
}

function tooLarge(maxBytes: number): string {
  return `Images must be ${formatMegabytes(maxBytes)} or smaller.`;
}

/** Read the whole body, giving up as soon as it exceeds `maxBytes`. */
async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) throw new ImageImportError("The other site sent an empty file.", 502);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new ImageImportError(tooLarge(maxBytes));
      }
      chunks.push(value);
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  if (total === 0) throw new ImageImportError("The other site sent an empty file.", 502);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
