import { upload } from "@vercel/blob/client";
import {
  UPLOAD_KINDS,
  UPLOAD_TYPES_MESSAGE,
  formatMegabytes,
  uploadKindForType,
} from "@/lib/uploads";

// BlockNote's `uploadFile` hook: used by the file panel's Upload tab and by
// paste/drop of files into the editor. Uploads go straight from the browser
// to Vercel Blob; /api/upload only mints the token (and enforces the same
// type/size rules server-side, so these client checks are just for friendlier
// messages).

const KIND_LABEL = { image: "Images", audio: "Audio files", video: "Videos" };

export async function uploadGuideFile(file: File): Promise<string> {
  const match = uploadKindForType(file.type);
  if (!match) throw new Error(UPLOAD_TYPES_MESSAGE);
  const { maxBytes } = UPLOAD_KINDS[match.kind];
  if (file.size > maxBytes) {
    throw new Error(
      `${KIND_LABEL[match.kind]} must be ${formatMegabytes(maxBytes)} or smaller.`,
    );
  }
  try {
    const blob = await upload(
      `guides/${crypto.randomUUID()}.${match.extension}`,
      file,
      {
        access: "public",
        handleUploadUrl: "/api/upload",
        contentType: file.type,
      },
    );
    return blob.url;
  } catch (err) {
    throw new Error(await describeUploadError(err));
  }
}

/**
 * The Blob client reports every token-route failure as the same generic
 * message, so ask the route directly what's wrong (signed out, uploads not
 * configured) to give the author something actionable.
 */
async function describeUploadError(err: unknown): Promise<string> {
  const message = err instanceof Error && err.message ? err.message : "Upload failed";
  if (!/client token/i.test(message)) return message;
  try {
    const res = await fetch("/api/upload", { method: "GET" });
    const data = (await res.json()) as { error?: string };
    if (data.error) return data.error;
  } catch {
    // fall through to the generic message
  }
  return "Upload failed — the upload service didn't accept the file.";
}
