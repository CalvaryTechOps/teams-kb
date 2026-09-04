import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSession } from "@/lib/permissions";
import {
  UPLOAD_KINDS,
  allowedContentTypes,
  uploadKindForPathname,
} from "@/lib/uploads";

// Guide media uploads (paste/drop/file panel in the BlockNote editor). The
// browser uploads straight to Vercel Blob with a short-lived token minted
// here, so audio and video aren't capped by the function body limit that a
// proxied upload would hit. Blob URLs are public-but-unguessable — accepted v1
// tradeoff (see README); the auth-proxied upgrade path needs no schema change.

/** Readiness probe the editor calls to explain a failed token request. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Your session has expired — sign in again to upload." }, { status: 401 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json(
      { error: "File uploads aren't configured yet (BLOB_READ_WRITE_TOKEN is missing)." },
      { status: 503 },
    );
  }
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body || typeof body !== "object" || !("type" in body)) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  // Token requests come from a signed-in author. Completion callbacks come from
  // Vercel Blob itself and are signature-checked inside handleUpload.
  if (body.type === "blob.generate-client-token") {
    const session = await getSession();
    if (!session) {
      return Response.json({ error: "Not signed in" }, { status: 401 });
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return Response.json(
        { error: "File uploads aren't configured yet (BLOB_READ_WRITE_TOKEN is missing)." },
        { status: 503 },
      );
    }
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const kind = uploadKindForPathname(pathname);
        if (!kind) {
          throw new Error("Only images, audio and video files can be uploaded.");
        }
        return {
          allowedContentTypes: allowedContentTypes(kind),
          maximumSizeInBytes: UPLOAD_KINDS[kind].maxBytes,
          addRandomSuffix: false,
        };
      },
      onUploadCompleted: async () => {
        // Nothing to record: the editor writes the URL into the guide body.
      },
    });
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
