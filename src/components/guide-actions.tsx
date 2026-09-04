"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  DownloadIcon,
  LinkIcon,
  PencilIcon,
} from "@/components/icons";
import { buttonClasses } from "@/components/ui";
import type { GuideBlock } from "@/lib/guide-content";
import {
  EXPORT_FORMATS,
  EXPORT_FORMAT_ORDER,
  type ExportFormat,
} from "@/lib/export-formats";

// Split button at the end of a guide's metadata row: "Copy link" as the main
// action, a chevron opening Download PDF / DOCX / Markdown and — for people
// who may edit — "Edit guide", the same target and permission as the header
// button. Hand-rolled menu (no menu primitive exists in the app yet) with the
// usual keyboard contract: arrows move, Home/End jump, Escape closes and
// returns focus, clicking or tabbing away closes.
//
// The heavy export code lives in guide-export.tsx and is imported only when
// a download is chosen, so the guide page's own bundle stays small.

const COPIED_FOR_MS = 2000;

const segment = buttonClasses({ variant: "secondary", size: "sm" });
const menuItem =
  "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-grey-800 " +
  "hover:bg-grey-50 focus-visible:bg-grey-50 focus-visible:outline-none " +
  "disabled:pointer-events-none disabled:opacity-50";

export function GuideActions({
  path,
  title,
  blocks,
  updatedAt,
  author,
  editHref,
}: {
  /** Canonical guide path (no query string) — what "Copy link" copies. */
  path: string;
  title: string;
  /** The revision being viewed; exports use exactly what's on screen. */
  blocks: GuideBlock[];
  /** That revision's date and author, for the byline in exports. */
  updatedAt: Date;
  author: string;
  /** Present only when the viewer may edit (same gate as the header button). */
  editHref?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const chevronRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const closeMenu = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) chevronRef.current?.focus();
  }, []);

  // Focus the first item when the menu opens.
  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
  }, [open]);

  // Click anywhere outside the component closes the menu.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    // Focus moving somewhere outside the whole component (Tab past the last
    // item, clicking elsewhere) closes the menu; moving between our own
    // controls does not.
    if (!rootRef.current?.contains(e.relatedTarget as Node | null)) {
      setOpen(false);
    }
  };

  const copyLink = async () => {
    const url = new URL(path, window.location.origin).href;
    setError(null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setCopyFallback(null);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_FOR_MS);
    } catch {
      // No clipboard access (insecure context, denied permission): show the
      // URL pre-selected so a keyboard copy is one keystroke away.
      setCopyFallback(url);
    }
  };

  const runExport = async (format: ExportFormat) => {
    if (busy) return;
    setBusy(format);
    setError(null);
    try {
      const { exportGuide } = await import("./guide-export");
      await exportGuide(format, { title, blocks, updatedAt, author });
    } catch (err) {
      setError(
        `Couldn't prepare the ${EXPORT_FORMATS[format].label}: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      );
    } finally {
      setBusy(null);
      closeMenu(true);
    }
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([disabled])',
      ) ?? [],
    );
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    const focusAt = (i: number) => items[(i + items.length) % items.length]?.focus();
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusAt(index - 1);
        break;
      case "Home":
        e.preventDefault();
        focusAt(0);
        break;
      case "End":
        e.preventDefault();
        focusAt(items.length - 1);
        break;
      case "Escape":
        e.preventDefault();
        closeMenu(true);
        break;
    }
  };

  const onChevronKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" && !open) {
      e.preventDefault();
      setOpen(true);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      closeMenu(true);
    }
  };

  return (
    <div ref={rootRef} className="relative shrink-0" onBlur={onBlur}>
      <div className="flex">
        <button
          type="button"
          onClick={copyLink}
          className={`${segment} rounded-r-none`}
        >
          {copied ? <CheckIcon size={13} /> : <LinkIcon size={13} />}
          <span aria-live="polite">{copied ? "Copied" : "Copy link"}</span>
        </button>
        <button
          ref={chevronRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="More actions"
          onClick={() => setOpen((o) => !o)}
          onKeyDown={onChevronKeyDown}
          className={`${segment} -ml-px rounded-l-none px-2.5`}
        >
          <ChevronDownIcon size={13} />
        </button>
      </div>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Guide actions"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-full z-20 mt-1.5 w-[220px] overflow-hidden rounded-lg border border-grey-200 bg-white py-1.5 shadow-sm"
        >
          {EXPORT_FORMAT_ORDER.map((format) => (
            <button
              key={format}
              type="button"
              role="menuitem"
              disabled={busy !== null}
              aria-busy={busy === format || undefined}
              onClick={() => void runExport(format)}
              className={menuItem}
            >
              <DownloadIcon size={15} className="text-grey-500" />
              {busy === format
                ? `Preparing ${EXPORT_FORMATS[format].label}…`
                : `Download ${EXPORT_FORMATS[format].label}`}
            </button>
          ))}
          {editHref && (
            <>
              <div role="separator" className="my-1.5 border-t border-grey-200" />
              <Link
                href={editHref}
                role="menuitem"
                onClick={() => closeMenu()}
                className={menuItem}
              >
                <PencilIcon size={15} className="text-grey-500" />
                Edit guide
              </Link>
            </>
          )}
        </div>
      )}

      {copyFallback && (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-[320px] rounded-lg border border-grey-200 bg-white p-3 shadow-sm">
          <p className="mb-1.5 text-xs text-grey-600">
            Couldn&apos;t reach the clipboard. Press ⌘/Ctrl+C to copy:
          </p>
          <input
            readOnly
            autoFocus
            value={copyFallback}
            aria-label="Guide link"
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setCopyFallback(null);
            }}
            className="h-8 w-full rounded-md border border-grey-300 px-2 text-xs text-grey-800 focus:outline-none focus:shadow-focus"
          />
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="absolute right-0 top-full mt-1.5 w-max max-w-[320px] text-xs text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}
