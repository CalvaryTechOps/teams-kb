// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { GuideBlock } from "@/lib/guide-content";

// The split button's contract: what "Copy link" copies, when "Edit guide"
// appears, and that choosing a download reaches the (lazily loaded) exporter
// with the right format. The exporter itself is mocked here and covered by
// guide-export.test.ts.

const exportGuide = vi.fn(async () => {});
vi.mock("./guide-export", () => ({ exportGuide }));

// next/link needs the app router context; a plain anchor is enough here.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: React.ComponentProps<"a"> & { href: string }) =>
    React.createElement("a", { href, ...rest }, children),
}));

import { GuideActions } from "./guide-actions";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BLOCKS: GuideBlock[] = [
  {
    id: "a",
    type: "paragraph",
    props: { textColor: "default", backgroundColor: "default", textAlignment: "left" },
    content: [{ type: "text", text: "Hello", styles: {} }],
    children: [],
  },
];

const UPDATED = new Date("2026-09-03T12:00:00Z");

let root: Root;
let container: HTMLDivElement;

function mount(props: Partial<React.ComponentProps<typeof GuideActions>> = {}) {
  act(() => {
    root.render(
      <GuideActions
        path="/spaces/mp/guides/correct-an-email"
        title="How to correct an email address"
        blocks={BLOCKS}
        updatedAt={UPDATED}
        author="Chris Adams"
        {...props}
      />,
    );
  });
}

const byText = (text: string) =>
  Array.from(container.querySelectorAll<HTMLElement>("button, a")).find(
    (el) => el.textContent?.trim() === text,
  );
const chevron = () =>
  container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
const menu = () => container.querySelector<HTMLElement>('[role="menu"]');
const items = () =>
  Array.from(container.querySelectorAll<HTMLElement>('[role="menuitem"]')).map(
    (el) => el.textContent?.trim(),
  );

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function key(el: Element, key: string) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  exportGuide.mockClear();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: new URL("https://kb.example.org/spaces/mp/guides/correct-an-email?rev=draft"),
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("GuideActions", () => {
  it("copies the canonical absolute URL and confirms briefly", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    mount();

    await act(async () => {
      byText("Copy link")!.click();
    });
    expect(writeText).toHaveBeenCalledWith(
      "https://kb.example.org/spaces/mp/guides/correct-an-email",
    );
    expect(byText("Copied")).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(byText("Copy link")).toBeDefined();
    expect(byText("Copied")).toBeUndefined();
  });

  it("falls back to a selectable URL when the clipboard is refused", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) },
    });
    mount();
    await act(async () => {
      byText("Copy link")!.click();
    });
    const input = container.querySelector<HTMLInputElement>("input[readonly]");
    expect(input?.value).toBe("https://kb.example.org/spaces/mp/guides/correct-an-email");
  });

  it("lists the three downloads, and Edit guide only for editors", () => {
    mount();
    click(chevron());
    expect(menu()).not.toBeNull();
    expect(items()).toEqual(["Download PDF", "Download DOCX", "Download Markdown"]);
    expect(chevron().getAttribute("aria-expanded")).toBe("true");

    mount({ editHref: "/spaces/mp/guides/correct-an-email/edit" });
    expect(items()).toEqual([
      "Download PDF",
      "Download DOCX",
      "Download Markdown",
      "Edit guide",
    ]);
    expect(byText("Edit guide")?.getAttribute("href")).toBe(
      "/spaces/mp/guides/correct-an-email/edit",
    );
  });

  it("closes on Escape (returning focus) and on an outside click", () => {
    mount();
    click(chevron());
    expect(document.activeElement?.textContent?.trim()).toBe("Download PDF");

    key(menu()!, "Escape");
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(chevron());

    click(chevron());
    expect(menu()).not.toBeNull();
    click(document.body);
    expect(menu()).toBeNull();
  });

  it("moves focus with the arrow keys and wraps", () => {
    mount({ editHref: "/edit" });
    click(chevron());
    const m = menu()!;
    key(m, "ArrowDown");
    expect(document.activeElement?.textContent?.trim()).toBe("Download DOCX");
    key(m, "End");
    expect(document.activeElement?.textContent?.trim()).toBe("Edit guide");
    key(m, "ArrowDown");
    expect(document.activeElement?.textContent?.trim()).toBe("Download PDF");
    key(m, "ArrowUp");
    expect(document.activeElement?.textContent?.trim()).toBe("Edit guide");
  });

  it("runs the chosen export with the document on screen, then closes", async () => {
    mount();
    click(chevron());
    await act(async () => {
      byText("Download DOCX")!.click();
    });
    expect(exportGuide).toHaveBeenCalledWith("docx", {
      title: "How to correct an email address",
      blocks: BLOCKS,
      updatedAt: UPDATED,
      author: "Chris Adams",
    });
    expect(menu()).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("surfaces an export failure without leaving the menu open", async () => {
    exportGuide.mockRejectedValueOnce(new Error("fonts missing"));
    mount();
    click(chevron());
    await act(async () => {
      byText("Download PDF")!.click();
    });
    expect(menu()).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Couldn't prepare the PDF: fonts missing",
    );
  });
});
