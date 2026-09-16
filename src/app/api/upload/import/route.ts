import { put } from "@vercel/blob";
import { getSession } from "@/lib/permissions";
import { ImageImportError, importImage } from "@/lib/image-import";

// Copy one externally hosted image into our Blob store and return its new
// URL. The editor calls this for each external image when the author clicks
// "Copy images to this site" (plans/import-external-images.md); the editor
// then rewrites the block's url, so nothing is recorded here. Same rules and
// pathname as browser uploads (see ../route.ts and src/lib/uploads.ts), but
// the bytes are fetched server-side because the other site rarely allows the
// browser to read them (CORS).

// A slow origin plus a 10 MB transfer must not hit the default function limit.
export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Your session has expired — sign in again to copy images." }, { status: 401 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json(
      { error: "File uploads aren't configured yet (BLOB_READ_WRITE_TOKEN is missing)." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
  const url = body && typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  try {
    const result = await importImage(url, {
      put: async (pathname, bytes, contentType) => {
        const blob = await put(pathname, Buffer.from(bytes), {
          access: "public",
          contentType,
          addRandomSuffix: false,
        });
        return { url: blob.url };
      },
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof ImageImportError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error("image import failed", err);
    return Response.json({ error: "The image couldn't be copied. Try again later." }, { status: 502 });
  }
}
