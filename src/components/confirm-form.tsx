"use client";

import type { FormEvent, ReactNode } from "react";

// A <form> that posts to a server action only after a native confirm. The
// children (selects, inputs, the submit button) render on the server; this
// wrapper exists solely for the confirm, and the action re-checks
// permissions regardless. Because it's a client boundary, the message is a
// string: `{choice}` in it is replaced with the visible label of the option
// selected in the `choiceField` <select>, so the prompt can name the target.
export function ConfirmForm({
  action,
  message,
  choiceField,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  message: string;
  choiceField?: string;
  className?: string;
  children: ReactNode;
}) {
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    let text = message;
    if (choiceField) {
      const field = e.currentTarget.elements.namedItem(choiceField);
      const label =
        field instanceof HTMLSelectElement
          ? field.selectedOptions[0]?.text ?? "?"
          : "?";
      text = text.replaceAll("{choice}", label);
    }
    if (!window.confirm(text)) e.preventDefault();
  };
  return (
    <form action={action} onSubmit={onSubmit} className={className}>
      {children}
    </form>
  );
}
