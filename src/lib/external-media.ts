// Which guide images live somewhere other than our Blob store, and how to
// tell what kind of image a byte stream is. Pure TypeScript (no React, no
// BlockNote import) so the editor's notice bar and the server-side copy
// (image-import.ts) share one definition of "external" and one sniffer.
//
// Background: files pasted or dropped into the editor upload to Blob, but an
// image pasted as part of another website's HTML keeps that site's URL.
// Those guides break when the other site removes the file, so the editor
// offers to copy such images across (plans/import-external-images.md).

/** Hostname suffix of every URL our Vercel Blob store hands out. */
const OWN_BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

/** True for a URL served by our own Blob store (already durable). */
export function isOwnBlobUrl(url: string): boolean {
  const parsed = tryParseUrl(url);
  return (
    parsed !== undefined &&
    parsed.protocol === "https:" &&
    parsed.hostname.endsWith(OWN_BLOB_HOST_SUFFIX)
  );
}

/**
 * SVG is deliberately outside the upload allowlist (it can carry scripts),
 * so an external SVG is never offered for copying; the block keeps working
 * from its original URL. Judged by the path's extension — a server that
 * hides the type behind an extensionless URL is caught by the copy route's
 * type check instead.
 */
export function looksLikeSvgUrl(url: string): boolean {
  const parsed = tryParseUrl(url);
  return parsed !== undefined && /\.svg$/i.test(parsed.pathname);
}

/** The minimum a block needs to be walked: BlockNote's and our GuideBlock both fit. */
export type BlockLike = {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  children?: BlockLike[];
};

export type ExternalImage = { id: string; url: string };

/**
 * Every image block (at any depth) whose url is a web URL that is not ours
 * and not an SVG, in document order. An empty url is an unfilled block.
 */
export function externalImageBlocks(blocks: readonly BlockLike[]): ExternalImage[] {
  const out: ExternalImage[] = [];
  const walk = (list: readonly BlockLike[]) => {
    for (const block of list) {
      if (block.type === "image") {
        const url = block.props?.url;
        if (
          typeof url === "string" &&
          /^https?:\/\//i.test(url) &&
          !isOwnBlobUrl(url) &&
          !looksLikeSvgUrl(url)
        ) {
          out.push({ id: block.id, url });
        }
      }
      if (block.children && block.children.length > 0) walk(block.children);
    }
  };
  walk(blocks);
  return out;
}

/**
 * Image MIME type from the first bytes of a file — PNG, JPEG, GIF and WebP,
 * the four kinds the upload rules allow. Servers routinely label images
 * `application/octet-stream`, and a server can claim `image/png` for
 * anything, so the bytes are the authority. Needs at least 12 bytes to
 * recognise WebP; returns undefined for anything unrecognised.
 */
export function sniffImageType(head: Uint8Array): string | undefined {
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (ascii(head, 0, 6) === "GIF87a" || ascii(head, 0, 6) === "GIF89a") return "image/gif";
  if (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WEBP") return "image/webp";
  return undefined;
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((b, i) => bytes[i] === b);
}

function ascii(bytes: Uint8Array, from: number, to: number): string {
  if (bytes.length < to) return "";
  let s = "";
  for (let i = from; i < to; i++) s += String.fromCharCode(bytes[i]!);
  return s;
}

function tryParseUrl(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}
