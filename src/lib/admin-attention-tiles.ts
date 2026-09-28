// Pure presentation of the admin dashboard's "Needs attention" row — no
// React, no server imports, so it is unit-tested directly. The counts come
// from attentionCounts() in admin-attention.ts (server-only); this module
// turns them into tiles with a fixed order, a link target and a caption that
// says what the number means. See plans/admin-attention-kpis.md.

export type AttentionCounts = {
  orphanedSpaces: number;
  allStaffRequests: number;
  deletionRequests: number;
  pendingSubmissions: number;
};

export type AttentionTile = {
  key: keyof AttentionCounts;
  label: string;
  count: number;
  href: string;
  /** What the number means, or what to do about it when it is non-zero. */
  caption: string;
};

type TileSpec = {
  key: keyof AttentionCounts;
  label: string;
  href: string;
  zero: string;
  some: string;
};

const TILES: readonly TileSpec[] = [
  {
    key: "orphanedSpaces",
    label: "Orphaned spaces",
    href: "/admin/spaces",
    zero: "Every space has an active department",
    some: "Re-home or merge",
  },
  {
    key: "allStaffRequests",
    label: "All-staff requests",
    href: "/admin/all-staff-requests",
    zero: "Nothing waiting",
    some: "Awaiting your decision",
  },
  {
    key: "deletionRequests",
    label: "Deletion requests",
    href: "/admin/deletion-requests",
    zero: "Nothing waiting",
    some: "Awaiting your decision",
  },
  {
    key: "pendingSubmissions",
    label: "Guides pending review",
    href: "/admin/guides?filter=pending",
    zero: "Nothing waiting",
    some: "Submitted by members, not yet published",
  },
];

/** The four tiles, always in the same order and always all present. */
export function attentionTiles(counts: AttentionCounts): AttentionTile[] {
  return TILES.map((t) => {
    const count = counts[t.key];
    return {
      key: t.key,
      label: t.label,
      count,
      href: t.href,
      caption: count > 0 ? t.some : t.zero,
    };
  });
}
