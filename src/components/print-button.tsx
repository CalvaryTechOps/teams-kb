"use client";

import { Button } from "@/components/ui";
import type { ComponentProps } from "react";

/** Opens the browser's print dialog for the current page. */
export function PrintButton(props: Omit<ComponentProps<typeof Button>, "onClick">) {
  return <Button type="button" onClick={() => window.print()} {...props} />;
}
