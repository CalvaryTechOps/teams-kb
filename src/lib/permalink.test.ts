import { describe, expect, it } from "vitest";
import type { GroupAccess } from "./guide-permissions";
import { classifyPermalink, guidePath } from "./permalink";

const DEPT = "group-dept";

function access(overrides: Partial<GroupAccess> = {}): GroupAccess {
  return {
    userId: "user-1",
    memberGroupIds: new Set(),
    ownerGroupIds: new Set(),
    isAdmin: false,
    ...overrides,
  };
}

const row = {
  spaceGroupId: DEPT,
  status: "published" as const,
  audience: "department" as const,
  spaceSlug: "facilities",
  spaceName: "Facilities",
  guideSlug: "reset-a-badge",
  title: "Reset a badge",
};

describe("classifyPermalink", () => {
  it("redirects a reader to the guide", () => {
    const result = classifyPermalink(access({ memberGroupIds: new Set([DEPT]) }), row);
    expect(result).toEqual({
      kind: "ok",
      target: {
        spaceSlug: "facilities",
        spaceName: "Facilities",
        guideSlug: "reset-a-badge",
        title: "Reset a badge",
      },
    });
  });

  it("is not found when no guide has the id", () => {
    expect(classifyPermalink(access({ isAdmin: true }), undefined)).toEqual({
      kind: "not_found",
    });
  });

  it("is not found for a guide awaiting deletion, even to admins", () => {
    expect(
      classifyPermalink(access({ isAdmin: true }), { ...row, status: "deleted" }),
    ).toEqual({ kind: "not_found" });
  });

  it("names the department when a published guide is off limits", () => {
    expect(classifyPermalink(access(), row)).toEqual({
      kind: "forbidden",
      spaceName: "Facilities",
    });
  });

  it("hides an unpublished guide as not found from those who may not see it", () => {
    const member = access({ memberGroupIds: new Set([DEPT]) });
    expect(
      classifyPermalink(member, { ...row, status: "draft", createdBy: "someone-else" }),
    ).toEqual({ kind: "not_found" });
    expect(
      classifyPermalink(member, { ...row, status: "draft", createdBy: "user-1" }).kind,
    ).toBe("ok");
    expect(
      classifyPermalink(access({ ownerGroupIds: new Set([DEPT]) }), {
        ...row,
        status: "draft",
      }).kind,
    ).toBe("ok");
  });

  it("lets audience readers through on a shared guide", () => {
    const result = classifyPermalink(
      access({ memberGroupIds: new Set(["group-other"]) }),
      { ...row, audience: "groups", audienceGroupIds: ["group-other"] },
    );
    expect(result.kind).toBe("ok");
  });
});

describe("guidePath", () => {
  it("encodes both segments", () => {
    expect(
      guidePath({ spaceSlug: "a b", guideSlug: "c/d", spaceName: "", title: "" }),
    ).toBe("/spaces/a%20b/guides/c%2Fd");
  });
});
