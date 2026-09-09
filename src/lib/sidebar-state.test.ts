import { describe, expect, it } from "vitest";
import { shortcutFor, toggleShortcutLabel, type ShortcutEvent } from "./sidebar-state";

const key = (
  k: string,
  over: Partial<ShortcutEvent> = {},
): ShortcutEvent => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  isComposing: false,
  defaultPrevented: false,
  target: { tagName: "BODY" } as unknown as EventTarget,
  ...over,
});

const el = (tagName: string, isContentEditable = false) =>
  ({ tagName, isContentEditable }) as unknown as EventTarget;

describe("shortcutFor", () => {
  it("toggles on Cmd+\\ and Ctrl+\\, even from inside an input", () => {
    expect(shortcutFor(key("\\", { metaKey: true }))).toBe("toggle");
    expect(shortcutFor(key("\\", { ctrlKey: true }))).toBe("toggle");
    expect(
      shortcutFor(key("\\", { ctrlKey: true, target: el("INPUT") })),
    ).toBe("toggle");
    expect(
      shortcutFor(key("\\", { metaKey: true, target: el("DIV", true) })),
    ).toBe("toggle");
  });

  it("ignores a bare backslash and Alt-modified combos", () => {
    expect(shortcutFor(key("\\"))).toBeNull();
    expect(shortcutFor(key("\\", { ctrlKey: true, altKey: true }))).toBeNull();
  });

  it("focuses search on / from non-editable targets", () => {
    expect(shortcutFor(key("/"))).toBe("search");
    expect(shortcutFor(key("/", { target: el("A") }))).toBe("search");
    expect(shortcutFor(key("/", { target: el("BUTTON") }))).toBe("search");
    expect(shortcutFor(key("/", { target: null }))).toBe("search");
  });

  it("leaves / alone while typing", () => {
    expect(shortcutFor(key("/", { target: el("INPUT") }))).toBeNull();
    expect(shortcutFor(key("/", { target: el("input") }))).toBeNull();
    expect(shortcutFor(key("/", { target: el("TEXTAREA") }))).toBeNull();
    expect(shortcutFor(key("/", { target: el("SELECT") }))).toBeNull();
    // BlockNote's ProseMirror root: a contenteditable div.
    expect(shortcutFor(key("/", { target: el("DIV", true) }))).toBeNull();
  });

  it("leaves / alone with modifiers, during IME composition, or when handled", () => {
    expect(shortcutFor(key("/", { metaKey: true }))).toBeNull();
    expect(shortcutFor(key("/", { ctrlKey: true }))).toBeNull();
    expect(shortcutFor(key("/", { altKey: true }))).toBeNull();
    expect(shortcutFor(key("/", { isComposing: true }))).toBeNull();
    expect(shortcutFor(key("/", { defaultPrevented: true }))).toBeNull();
  });

  it("maps Escape and nothing else", () => {
    expect(shortcutFor(key("Escape"))).toBe("escape");
    expect(shortcutFor(key("Escape", { defaultPrevented: true }))).toBeNull();
    expect(shortcutFor(key("a"))).toBeNull();
    expect(shortcutFor(key("Enter"))).toBeNull();
  });
});

describe("toggleShortcutLabel", () => {
  it("uses the platform modifier", () => {
    expect(toggleShortcutLabel(true)).toBe("⌘\\");
    expect(toggleShortcutLabel(false)).toBe("Ctrl+\\");
  });
});
