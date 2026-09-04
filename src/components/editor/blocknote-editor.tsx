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
import { attachSubmitSync } from "./form-sync";
import { guideSchema, type GuideSchema } from "./schema";
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

  return (
    <div className="guide-editor overflow-hidden rounded-lg border border-grey-300 bg-white focus-within:border-cyan-400 focus-within:shadow-focus">
      <input
        ref={hiddenRef}
        type="hidden"
        name={name}
        defaultValue={initialContent ? JSON.stringify(initialContent) : ""}
      />
      <BlockNoteView
        editor={editor}
        theme="light"
        formattingToolbar={false}
        slashMenu={false}
        onChange={syncNow}
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
          className="border-t border-grey-200 bg-danger-100 px-5 py-2 text-xs text-danger"
        >
          {uploadError}
        </p>
      )}
    </div>
  );
}
