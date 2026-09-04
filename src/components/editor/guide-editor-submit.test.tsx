// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { attachSubmitSync } from "./form-sync";

// Regression test for a real production bug: a deletion-only edit submitted
// the guide's ORIGINAL content. The per-change sync of the hidden input can be
// undone by a later React re-render of the uncontrolled input, so the
// submitted value must come from a submit-time sync of the live document.
//
// The BlockNote editor itself needs a real browser (layout, selection APIs)
// and is exercised in the manual test plan; this pins the form-side contract
// it relies on. See blocknote-editor.tsx for where the hook is attached.

const ORIGINAL = JSON.stringify([
  { id: "a", type: "paragraph", props: {}, content: [{ type: "text", text: "Some intro text.", styles: {} }], children: [] },
  { id: "b", type: "paragraph", props: {}, content: [{ type: "text", text: "Last line", styles: {} }], children: [] },
]);
const AFTER_DELETE = JSON.stringify([
  { id: "b", type: "paragraph", props: {}, content: [{ type: "text", text: "Last line", styles: {} }], children: [] },
]);

function mount() {
  const form = document.createElement("form");
  const hidden = document.createElement("input");
  hidden.type = "hidden";
  hidden.name = "content";
  hidden.defaultValue = ORIGINAL;
  form.appendChild(hidden);
  document.body.appendChild(form);
  return { form, hidden };
}

describe("editor form submission", () => {
  it("submits the live document even when the per-change sync was lost", () => {
    const { form, hidden } = mount();
    // Stand-in for editor.document after the author deleted a paragraph.
    let liveDocument = AFTER_DELETE;
    const detach = attachSubmitSync(hidden, () => liveDocument);

    // Simulate React restoring the uncontrolled input to its default value.
    hidden.value = ORIGINAL;
    expect(hidden.value).toContain("Some intro text");

    // Whatever reads the form on submit (React's action building FormData
    // does so in a bubbling listener) must see the capture-phase rewrite.
    let seenOnSubmit: string | null = null;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      seenOnSubmit = new FormData(form).get("content") as string;
    });
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(seenOnSubmit).toBe(AFTER_DELETE);
    expect(hidden.value).not.toContain("Some intro text");
    expect(hidden.value).toContain("Last line");

    // Detaching stops the sync (component unmount).
    detach();
    liveDocument = "[]";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(hidden.value).toBe(AFTER_DELETE);
    form.remove();
  });

  it("is a no-op for an input outside any form", () => {
    const hidden = document.createElement("input");
    expect(() => attachSubmitSync(hidden, () => "x")()).not.toThrow();
  });
});
