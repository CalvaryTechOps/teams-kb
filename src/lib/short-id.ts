// A guide's permanent short id: the `{id}` in `/a/{id}`, assigned once at
// creation and never changed by a move, rename or re-slug. Pure module (no
// server imports) so it unit-tests directly; the DB pre-check lives with the
// insert in guide-writes.ts. plans/guide-permalinks.md §1.

/**
 * Digits 2–9 and consonants except l: nothing that reads as another
 * character on a scuffed label (0/o, 1/l/i, 5/s), and no vowels so a random
 * id can't spell a word. 27 symbols. Duplicated once, in the backfill
 * migration (drizzle/0010_guide-short-id.sql) — keep the two in step.
 */
export const SHORT_ID_ALPHABET = "23456789bcdfghjkmnpqrstvwxz";

/** 27^5 ≈ 14.3 million ids. */
export const SHORT_ID_LENGTH = 5;

/** Loosest shape a stored id could ever have taken, for parsing URL input. */
const SHORT_ID_INPUT_RE = /^[a-z0-9]{3,12}$/;

/** URL prefix of the redirecting route. */
export const PERMALINK_PREFIX = "/a/";

type RandomBytes = (bytes: Uint8Array) => Uint8Array;

/**
 * A fresh random id. Rejection sampling keeps every symbol equally likely
 * (256 is not a multiple of 27), so ids never skew toward the alphabet's
 * first characters.
 */
export function generateShortId(
  random: RandomBytes = (b) => crypto.getRandomValues(b),
): string {
  const limit = 256 - (256 % SHORT_ID_ALPHABET.length);
  let out = "";
  const buf = new Uint8Array(SHORT_ID_LENGTH * 2);
  while (out.length < SHORT_ID_LENGTH) {
    random(buf);
    for (const byte of buf) {
      if (byte >= limit) continue;
      out += SHORT_ID_ALPHABET[byte % SHORT_ID_ALPHABET.length];
      if (out.length === SHORT_ID_LENGTH) break;
    }
  }
  return out;
}

/**
 * Lowercase and trim what arrived in the URL; null when it cannot be an id
 * (wrong characters, absurd length). Deliberately looser than the current
 * alphabet and length so ids minted under a future change stay resolvable —
 * the database decides whether the id exists.
 */
export function normalizeShortId(input: string): string | null {
  const id = input.trim().toLowerCase();
  return SHORT_ID_INPUT_RE.test(id) ? id : null;
}

/** Site-relative permalink, e.g. "/a/7kq4x". */
export function permalinkPath(shortId: string): string {
  return `${PERMALINK_PREFIX}${encodeURIComponent(shortId)}`;
}

/** Absolute permalink under the deployment's public URL (trailing slash tolerated). */
export function permalinkUrl(appUrl: string, shortId: string): string {
  return `${appUrl.replace(/\/+$/, "")}${permalinkPath(shortId)}`;
}

/** The printable QR label page for a guide, keyed by the same permanent id. */
export function qrLabelPath(shortId: string): string {
  return `${permalinkPath(shortId)}/qr`;
}
