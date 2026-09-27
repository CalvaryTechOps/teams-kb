// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { RevisionMeta } from "@/lib/guide-revisions";

// The drop-down's contract: options in the order given with the rendered
// revision selected, a change navigates to that revision's address, and the
// published revision's address is the bare guide path.

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { RevisionPicker } from "./revision-picker";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BASE = "/spaces/ops/guides/reset-a-badge";
const CURRENT = "rev-2";

function rev(version: number, status: RevisionMeta["status"]): RevisionMeta {
  return {
    id: `rev-${version}`,
    version,
    status,
    authorId: "user-1",
    authorName: "Sam Example",
    createdAt: new Date("2026-09-01T12:00:00Z"),
  };
}

const REVISIONS = [rev(3, "draft"), rev(2, "published"), rev(1, "superseded")];

let root: Root;
let container: HTMLDivElement;

function mount(selectedId: string) {
  act(() => {
    root.render(
      <RevisionPicker
        basePath={BASE}
        revisions={REVISIONS}
        currentRevisionId={CURRENT}
        selectedId={selectedId}
      />,
    );
  });
}

const select = () => container.querySelector("select")!;

function choose(value: string) {
  act(() => {
    const el = select();
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  push.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("RevisionPicker", () => {
  it("lists the revisions in the order given with the rendered one selected", () => {
    mount("rev-3");
    const options = Array.from(select().options).map((o) => o.textContent);
    expect(options).toEqual([
      "v3 · Draft · Sep 1, 2026 · Sam Example",
      "v2 · Published · Sep 1, 2026 · Sam Example",
      "v1 · Superseded · Sep 1, 2026 · Sam Example",
    ]);
    expect(select().value).toBe("rev-3");
  });

  it("navigates to the chosen revision", () => {
    mount("rev-2");
    choose("rev-1");
    expect(push).toHaveBeenCalledWith(`${BASE}?rev=1`);
  });

  it("navigates to the bare path for the published revision", () => {
    mount("rev-3");
    choose("rev-2");
    expect(push).toHaveBeenCalledWith(BASE);
  });

  it("does nothing when the rendered revision is re-chosen", () => {
    mount("rev-3");
    choose("rev-3");
    expect(push).not.toHaveBeenCalled();
  });
});
