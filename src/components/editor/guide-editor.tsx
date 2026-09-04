"use client";

import dynamic from "next/dynamic";
import type { GuideBlock } from "@/lib/guide-content";

// Form-facing wrapper around the BlockNote editor. BlockNote is client-only,
// so the real editor loads with ssr: false (allowed only from a client
// component — hence this two-file split) behind a fixed-height placeholder so
// the form doesn't jump when it mounts.

const BlockNoteGuideEditor = dynamic(
  () => import("./blocknote-editor").then((m) => m.BlockNoteGuideEditor),
  {
    ssr: false,
    loading: () => (
      <div
        aria-busy
        className="min-h-[480px] animate-pulse rounded-lg border border-grey-300 bg-white"
      />
    ),
  },
);

export function GuideEditor({
  name,
  initialContent,
}: {
  name: string;
  initialContent?: GuideBlock[];
}) {
  return <BlockNoteGuideEditor name={name} initialContent={initialContent} />;
}
