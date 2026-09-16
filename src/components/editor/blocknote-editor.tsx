"use client";

import "@blocknote/mantine/style.css";
import { useEffect, useRef, useState } from "react";
import { combineByGroup, filterSuggestionItems, type PartialBlock } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import {
  FormattingToolbar,
  FormattingToolbarController,
  SuggestionMenuController,
  blockTypeSelectItems,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
} from "@blocknote/react";
import {
  getDiagramBlockTypeSelectItems,
  getDiagramSlashMenuItems,
} from "@blocknote/diagram-block";
import type { GuideBlock } from "@/lib/guide-content";
import { externalImageBlocks, type ExternalImage } from "@/lib/external-media";
import { useThemeMode } from "@/components/theme-provider";
import { Button } from "@/components/ui";
import { attachSubmitSync } from "./form-sync";
import { guideSchema, type GuideSchema } from "./schema";
import { copyExternalImages, type CopyProgress } from "./copy-external-images";
import { uploadGuideFile } from "./upload";

// The BlockNote editor proper. Client-only (BlockNote can't server-render), so
// guide-editor.tsx loads this file with next/dynamic and ssr: false. The form
// sees one hidden input holding the document as JSON; the server parses and
// validates it (parseGuideContent) before anything is stored.

type EditorBlock = PartialBlock<
  GuideSchema["blockSchema"],
  GuideSchema["inlineContentSchema"],
  GuideSchema["styleSchema"]
>;

export function BlockNoteGuideEditor({
  name,
  initialContent,
}: {
  name: string;
  /** Validated document for an existing guide; omit for a new one. */
  initialContent?: GuideBlock[];
}) {
  const hiddenRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Images pasted from other websites keep that site's URL and break when it
  // removes them. Track them so the notice bar below can offer a copy; the
  // copy itself is never automatic (some guides embed external images on
  // purpose). See plans/import-external-images.md.
  const [externalImages, setExternalImages] = useState<ExternalImage[]>([]);
  const externalKeyRef = useRef("");
  const [copy, setCopy] = useState<CopyProgress>({ busy: false, message: null });
  const copyBusyRef = useRef(false);

  const { mode } = useThemeMode();
  const editor = useCreateBlockNote({
    schema: guideSchema,
    initialContent:
      initialContent && initialContent.length > 0
        ? (initialContent as unknown as EditorBlock[])
        : undefined,
    uploadFile: async (file: File) => {
      setUploadError(null);
      try {
        return await uploadGuideFile(file);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Upload failed");
        throw err;
      }
    },
    tables: {
      splitCells: true,
      headers: true,
      cellBackgroundColor: true,
      cellTextColor: true,
    },
  });

  const serialize = () => JSON.stringify(editor.document);

  // Best-effort sync on every change, plus the authoritative submit-time sync.
  const syncNow = () => {
    if (hiddenRef.current) hiddenRef.current.value = serialize();
  };
  useEffect(() => {
    if (!hiddenRef.current) return;
    return attachSubmitSync(hiddenRef.current, serialize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // One cheap walk per change; only re-render when the set actually differs.
  // An author's own edit also clears a stale "Copied…" result, but the
  // block rewrites the copy makes mid-run must not.
  const refreshExternalImages = () => {
    const found = externalImageBlocks(editor.document);
    const key = found.map((f) => `${f.id}\u0000${f.url}`).join("\u0001");
    if (key === externalKeyRef.current) return;
    externalKeyRef.current = key;
    setExternalImages(found);
    if (!copyBusyRef.current) setCopy({ busy: false, message: null });
  };
  useEffect(() => {
    refreshExternalImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const startCopy = async () => {
    copyBusyRef.current = true;
    try {
      await copyExternalImages(externalImages, {
        rewrite: (id, url) => {
          editor.updateBlock(id, { props: { url } });
        },
        report: setCopy,
      });
    } finally {
      copyBusyRef.current = false;
      refreshExternalImages();
      syncNow();
    }
  };

  return (
    <div className="guide-editor overflow-hidden rounded-lg border border-border-strong bg-surface-raised focus-within:border-accent focus-within:shadow-focus">
      <input
        ref={hiddenRef}
        type="hidden"
        name={name}
        defaultValue={initialContent ? JSON.stringify(initialContent) : ""}
      />
      <BlockNoteView
        editor={editor}
        theme={mode}
        formattingToolbar={false}
        slashMenu={false}
        onChange={() => {
          syncNow();
          refreshExternalImages();
        }}
      >
        {/* Default toolbar, with the diagram block in the block-type menu. */}
        <FormattingToolbarController
          formattingToolbar={() => (
            <FormattingToolbar
              blockTypeSelectItems={[
                ...blockTypeSelectItems(editor.dictionary),
                ...getDiagramBlockTypeSelectItems(editor),
              ]}
            />
          )}
        />
        {/* Default slash menu plus the diagram item, grouped like the rest. */}
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems(
              combineByGroup(
                getDefaultReactSlashMenuItems(editor),
                getDiagramSlashMenuItems(editor),
              ),
              query,
            )
          }
        />
      </BlockNoteView>
      {uploadError && (
        <p
          role="alert"
          className="border-t border-border bg-danger-soft px-5 py-2 text-xs text-danger"
        >
          {uploadError}
        </p>
      )}
      {(externalImages.length > 0 || copy.message) && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border bg-warning-soft px-5 py-2 text-xs text-fg"
        >
          <p className="flex-1 min-w-[16rem]">
            {copy.message ??
              `${externalImages.length} ${externalImages.length === 1 ? "image is" : "images are"} hosted on other websites and will disappear if those sites remove them.`}
          </p>
          {externalImages.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={copy.busy}
              onClick={startCopy}
            >
              {copy.busy ? "Copying…" : "Copy images to this site"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
