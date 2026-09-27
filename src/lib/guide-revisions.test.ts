import { describe, expect, it } from "vitest";
import {
  canDeleteRevision,
  chooseRevision,
  parseRevisionParam,
  revisionHref,
  revisionOptionLabel,
  revisionStatusLabel,
  visibleRevisions,
  type RevisionMeta,
} from "./guide-revisions";

const OWNER = "user-owner";
const MEMBER = "user-member";
const OTHER = "user-other";

function rev(overrides: Partial<RevisionMeta> & { version: number }): RevisionMeta {
  return {
    id: `rev-${overrides.version}`,
    status: "draft",
    authorId: OTHER,
    authorName: "Other Person",
    createdAt: new Date("2026-09-01T12:00:00Z"),
    ...overrides,
  };
}

// v1 superseded, v2 published, v3 rejected (member), v4 draft (member),
// v5 pending (other). Deliberately unsorted.
const ALL: RevisionMeta[] = [
  rev({ version: 3, status: "rejected", authorId: MEMBER }),
  rev({ version: 1, status: "superseded" }),
  rev({ version: 5, status: "pending" }),
  rev({ version: 2, status: "published" }),
  rev({ version: 4, status: "draft", authorId: MEMBER }),
];
const CURRENT = "rev-2";

const approver = { userId: OWNER, canApprove: true };
const member = { userId: MEMBER, canApprove: false };

describe("parseRevisionParam", () => {
  it("accepts a positive integer", () => {
    expect(parseRevisionParam("3")).toBe(3);
    expect(parseRevisionParam("12")).toBe(12);
  });

  it("ignores anything else", () => {
    for (const raw of [undefined, "", "draft", "0", "-1", "3.5", "03", "abc", ["3", "4"]]) {
      expect(parseRevisionParam(raw)).toBeUndefined();
    }
  });
});

describe("visibleRevisions", () => {
  it("shows approvers everything, newest first", () => {
    expect(visibleRevisions(ALL, approver, CURRENT).map((r) => r.version)).toEqual([
      5, 4, 3, 2, 1,
    ]);
  });

  it("shows members only the published revision and their own", () => {
    expect(visibleRevisions(ALL, member, CURRENT).map((r) => r.version)).toEqual([
      4, 3, 2,
    ]);
  });

  it("shows a reader without edit rights only the published revision", () => {
    const reader = { canApprove: false };
    expect(visibleRevisions(ALL, reader, CURRENT).map((r) => r.version)).toEqual([2]);
  });

  it("does not mutate the input", () => {
    const copy = [...ALL];
    visibleRevisions(ALL, approver, CURRENT);
    expect(ALL).toEqual(copy);
  });
});

describe("chooseRevision", () => {
  const visible = visibleRevisions(ALL, approver, CURRENT);

  it("renders the published revision by default", () => {
    expect(chooseRevision(visible, undefined, CURRENT)?.version).toBe(2);
  });

  it("renders a requested visible revision", () => {
    expect(chooseRevision(visible, 4, CURRENT)?.version).toBe(4);
    expect(chooseRevision(visible, 1, CURRENT)?.version).toBe(1);
  });

  it("falls back to the published revision for an unknown version", () => {
    expect(chooseRevision(visible, 99, CURRENT)?.version).toBe(2);
  });

  it("ignores a request for a revision the viewer may not see", () => {
    const mine = visibleRevisions(ALL, member, CURRENT);
    expect(chooseRevision(mine, 5, CURRENT)?.version).toBe(2);
    expect(chooseRevision(mine, 4, CURRENT)?.version).toBe(4);
  });

  it("falls back to the newest visible revision when nothing is published", () => {
    const unpublished = visibleRevisions(
      [rev({ version: 1, status: "rejected" }), rev({ version: 2, status: "draft" })],
      approver,
      null,
    );
    expect(chooseRevision(unpublished, undefined, null)?.version).toBe(2);
  });

  it("renders a lone rejected revision of a never-published guide", () => {
    const only = [rev({ version: 1, status: "rejected", authorId: MEMBER })];
    expect(chooseRevision(only, undefined, null)?.version).toBe(1);
  });

  it("returns undefined when the viewer may see nothing", () => {
    const none = visibleRevisions([rev({ version: 1 })], member, null);
    expect(chooseRevision(none, undefined, null)).toBeUndefined();
  });
});

describe("revisionHref", () => {
  const base = "/spaces/ops/guides/reset-a-badge";

  it("is the bare path for the published revision", () => {
    expect(revisionHref(base, { id: CURRENT, version: 2 }, CURRENT)).toBe(base);
  });

  it("carries the version for any other revision", () => {
    expect(revisionHref(base, { id: "rev-4", version: 4 }, CURRENT)).toBe(
      `${base}?rev=4`,
    );
  });

  it("never treats a revision as published when nothing is", () => {
    expect(revisionHref(base, { id: "rev-1", version: 1 }, null)).toBe(`${base}?rev=1`);
  });
});

describe("revisionStatusLabel", () => {
  it("names each status", () => {
    expect(revisionStatusLabel({ id: CURRENT, status: "published" }, CURRENT)).toBe("Published");
    expect(revisionStatusLabel({ id: "x", status: "draft" }, CURRENT)).toBe("Draft");
    expect(revisionStatusLabel({ id: "x", status: "pending" }, CURRENT)).toBe("Pending approval");
    expect(revisionStatusLabel({ id: "x", status: "rejected" }, CURRENT)).toBe("Rejected");
    expect(revisionStatusLabel({ id: "x", status: "superseded" }, CURRENT)).toBe("Superseded");
  });
});

describe("revisionOptionLabel", () => {
  it("joins version, status, date and author", () => {
    expect(
      revisionOptionLabel(
        rev({ version: 2, status: "published", id: CURRENT, authorName: "Sam Example" }),
        CURRENT,
      ),
    ).toBe("v2 · Published · Sep 1, 2026 · Sam Example");
  });

  it("omits an unknown author", () => {
    expect(revisionOptionLabel(rev({ version: 4, authorName: null }), CURRENT)).toBe(
      "v4 · Draft · Sep 1, 2026",
    );
  });
});

describe("canDeleteRevision", () => {
  const draft = { status: "draft" as const, authorId: MEMBER };

  it("lets approvers delete any draft", () => {
    expect(canDeleteRevision(draft, approver, 2)).toBe(true);
  });

  it("lets an editor delete only their own draft", () => {
    expect(canDeleteRevision(draft, member, 2)).toBe(true);
    expect(canDeleteRevision({ ...draft, authorId: OTHER }, member, 2)).toBe(false);
    expect(canDeleteRevision(draft, { canApprove: false }, 2)).toBe(false);
  });

  it("refuses anything that is not a draft", () => {
    for (const status of ["pending", "published", "rejected", "superseded"] as const) {
      expect(canDeleteRevision({ status, authorId: MEMBER }, approver, 2)).toBe(false);
    }
  });

  it("refuses a guide's last revision", () => {
    expect(canDeleteRevision(draft, approver, 1)).toBe(false);
  });
});
