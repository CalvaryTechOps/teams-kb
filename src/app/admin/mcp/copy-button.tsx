"use client";

import { useState } from "react";

// Copies a snippet to the clipboard; the label flips briefly to confirm.
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard blocked (insecure context): the text is visible to select.
        }
      }}
      className="h-7 shrink-0 rounded-md border px-2 text-xs font-medium hover:bg-gray-50"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
