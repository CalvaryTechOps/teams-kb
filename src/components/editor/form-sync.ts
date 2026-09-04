// Keeps a hidden form field equal to the live editor document at the moment
// the form submits.
//
// Regression guard for a real production bug: the per-change sync of the
// hidden input can be undone by a later React re-render of the uncontrolled
// input, so a deletion-only edit once submitted the guide's ORIGINAL content.
// A capture-phase `submit` listener on the enclosing form runs before React's
// form action builds its FormData, so the submitted value is always the live
// document regardless of what the input held a moment earlier.

export function attachSubmitSync(
  hidden: HTMLInputElement,
  getValue: () => string,
): () => void {
  const form = hidden.form;
  if (!form) return () => {};
  const sync = () => {
    hidden.value = getValue();
  };
  form.addEventListener("submit", sync, { capture: true });
  return () => form.removeEventListener("submit", sync, { capture: true });
}
