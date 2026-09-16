import type { ExternalImage } from "@/lib/external-media";

// The "Copy images to this site" flow behind the editor's notice bar. Each
// distinct external URL is sent to /api/upload/import (which fetches the
// image server-side and stores it in Blob), then every block that used it is
// pointed at the new URL. Only `url` changes on the block, so the author's
// resize (previewWidth), alignment, caption and name survive untouched.
// Sequential on purpose: progress reads naturally and one slow origin can't
// fan out into a burst of function invocations. Failures are per image; the
// block keeps its external URL and the bar stays available for a retry.
// Nothing is saved — the rewritten document reaches the server only when
// the author submits the form, through the usual validation.

export type CopyProgress = { busy: boolean; message: string | null };

export type CopyDeps = {
  /** Point a block at its copied URL (editor.updateBlock in the real editor). */
  rewrite: (blockId: string, url: string) => void;
  report: (progress: CopyProgress) => void;
  fetch?: typeof fetch;
};

export type CopyResult = { copied: number; total: number; failures: string[] };

export async function copyExternalImages(
  images: readonly ExternalImage[],
  deps: CopyDeps,
): Promise<CopyResult> {
  // The same image pasted twice is fetched once and applied to both blocks.
  const blocksByUrl = new Map<string, string[]>();
  for (const image of images) {
    blocksByUrl.set(image.url, [...(blocksByUrl.get(image.url) ?? []), image.id]);
  }
  const urls = [...blocksByUrl.keys()];
  const total = urls.length;
  let copied = 0;
  const failures: string[] = [];

  for (const [index, url] of urls.entries()) {
    deps.report({ busy: true, message: `Copying ${index + 1} of ${total}…` });
    try {
      const stored = await requestCopy(url, deps.fetch ?? fetch);
      for (const id of blocksByUrl.get(url) ?? []) {
        try {
          deps.rewrite(id, stored);
        } catch {
          // The author deleted that block while the copy ran; nothing to update.
        }
      }
      copied++;
    } catch (err) {
      failures.push(err instanceof Error && err.message ? err.message : "Couldn't copy the image.");
    }
  }

  deps.report({ busy: false, message: summarize(copied, total, failures) });
  return { copied, total, failures };
}

/** The line the bar shows once the run finishes. */
export function summarize(copied: number, total: number, failures: readonly string[]): string {
  const noun = (n: number) => (n === 1 ? "image" : "images");
  if (failures.length === 0) return `Copied ${copied} ${noun(copied)} to this site.`;
  const reasons = [...new Set(failures)].join(" ");
  return `Copied ${copied} of ${total} ${noun(total)}. ${failures.length} couldn't be copied: ${reasons}`;
}

async function requestCopy(url: string, doFetch: typeof fetch): Promise<string> {
  let res: Response;
  try {
    res = await doFetch("/api/upload/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
  } catch {
    throw new Error("Couldn't reach the upload service.");
  }
  const data = (await res.json().catch(() => ({}))) as { url?: unknown; error?: unknown };
  if (!res.ok || typeof data.url !== "string" || !data.url) {
    throw new Error(
      typeof data.error === "string" && data.error ? data.error : "Couldn't copy the image.",
    );
  }
  return data.url;
}
