// What guide authors may upload, shared by the editor (client) and the
// /api/upload token route (server) so both sides enforce the same rules.
// Raster images, common audio and web video only — SVG stays out because it
// can carry scripts, and anything not in this list is refused.

export type UploadKind = "image" | "audio" | "video";

const MB = 1024 * 1024;

export const UPLOAD_KINDS: Record<
  UploadKind,
  { maxBytes: number; extensions: Record<string, string> }
> = {
  image: {
    maxBytes: 10 * MB,
    extensions: {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/gif": "gif",
      "image/webp": "webp",
    },
  },
  audio: {
    maxBytes: 50 * MB,
    extensions: {
      "audio/mpeg": "mp3",
      "audio/mp4": "m4a",
      "audio/x-m4a": "m4a",
      "audio/wav": "wav",
      "audio/x-wav": "wav",
      "audio/ogg": "ogg",
    },
  },
  video: {
    maxBytes: 250 * MB,
    extensions: {
      "video/mp4": "mp4",
      "video/webm": "webm",
    },
  },
};

export const UPLOAD_TYPES_MESSAGE =
  "Only PNG, JPEG, GIF or WebP images, MP3, M4A, WAV or OGG audio, and MP4 or WebM video can be uploaded.";

/** MIME type → the kind it belongs to and the extension we store it under. */
export function uploadKindForType(
  mimeType: string,
): { kind: UploadKind; extension: string } | undefined {
  for (const kind of Object.keys(UPLOAD_KINDS) as UploadKind[]) {
    const extension = UPLOAD_KINDS[kind].extensions[mimeType];
    if (extension) return { kind, extension };
  }
  return undefined;
}

const PATHNAME = /^guides\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.([a-z0-9]{2,5})$/;

/**
 * Blob pathnames are `guides/<uuid>.<ext>`; the extension decides which kind's
 * content types and size cap the upload token allows.
 */
export function uploadKindForPathname(pathname: string): UploadKind | undefined {
  const ext = PATHNAME.exec(pathname)?.[1];
  if (!ext) return undefined;
  for (const kind of Object.keys(UPLOAD_KINDS) as UploadKind[]) {
    if (Object.values(UPLOAD_KINDS[kind].extensions).includes(ext)) return kind;
  }
  return undefined;
}

export function allowedContentTypes(kind: UploadKind): string[] {
  return Object.keys(UPLOAD_KINDS[kind].extensions);
}

export function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / MB)} MB`;
}
