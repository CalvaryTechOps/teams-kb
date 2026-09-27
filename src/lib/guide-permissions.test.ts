import { describe, expect, it } from "vitest";
import {
  canDeleteGuideOutright,
  resolveGuidePermissions,
  type GroupAccess,
  type GuideForPermissions,
} from "./guide-permissions";

const DEPT_A = "group-dept-a";
const DEPT_B = "group-dept-b";
const SHARED_TARGET = "group-shared-target";

function access(overrides: Partial<GroupAccess> = {}): GroupAccess {
  return {
    memberGroupIds: new Set(),
    ownerGroupIds: new Set(),
    isAdmin: false,
    ...overrides,
  };
}

function guide(overrides: Partial<GuideForPermissions> = {}): GuideForPermissions {
  return {
    spaceGroupId: DEPT_A,
    status: "published",
    audience: "department",
    ...overrides,
  };
}

describe("resolveGuidePermissions", () => {
  it("grants admins everything, regardless of membership", () => {
    const perms = resolveGuidePermissions(
      access({ isAdmin: true }),
      guide({ status: "draft" }),
    );
    expect(perms).toEqual({ canRead: true, canEdit: true, canApprove: true });
  });

  it("lets department members read and edit, but not approve", () => {
    const perms = resolveGuidePermissions(
      access({ memberGroupIds: new Set([DEPT_A]) }),
      guide(),
    );
    expect(perms).toEqual({ canRead: true, canEdit: true, canApprove: false });
  });

  it("lets owners approve even when Graph doesn't list them as members", () => {
    const perms = resolveGuidePermissions(
      access({ ownerGroupIds: new Set([DEPT_A]) }),
      guide(),
    );
    expect(perms).toEqual({ canRead: true, canEdit: true, canApprove: true });
  });

  it("hides department guides from other departments — even published", () => {
    const perms = resolveGuidePermissions(
      access({ memberGroupIds: new Set([DEPT_B]) }),
      guide(),
    );
    expect(perms).toEqual({ canRead: false, canEdit: false, canApprove: false });
  });

  it("hides drafts from everyone outside the space", () => {
    const perms = resolveGuidePermissions(
      access({ memberGroupIds: new Set([DEPT_B]) }),
      guide({ status: "draft", audience: "all_staff" }),
    );
    expect(perms.canRead).toBe(false);
  });

  it("hides a colleague's draft from fellow members", () => {
    const perms = resolveGuidePermissions(
      access({ userId: "user-b", memberGroupIds: new Set([DEPT_A]) }),
      guide({ status: "draft", createdBy: "user-a" }),
    );
    expect(perms).toEqual({ canRead: false, canEdit: false, canApprove: false });
  });

  it("lets the author see and edit their own draft", () => {
    const perms = resolveGuidePermissions(
      access({ userId: "user-a", memberGroupIds: new Set([DEPT_A]) }),
      guide({ status: "draft", createdBy: "user-a" }),
    );
    expect(perms).toEqual({ canRead: true, canEdit: true, canApprove: false });
  });

  it("lets space owners see every draft in their space", () => {
    const perms = resolveGuidePermissions(
      access({ userId: "user-b", ownerGroupIds: new Set([DEPT_A]) }),
      guide({ status: "draft", createdBy: "user-a" }),
    );
    expect(perms).toEqual({ canRead: true, canEdit: true, canApprove: true });
  });

  it("shows published all-staff guides to anyone", () => {
    const perms = resolveGuidePermissions(
      access(),
      guide({ audience: "all_staff" }),
    );
    expect(perms).toEqual({ canRead: true, canEdit: false, canApprove: false });
  });

  it("shows group-shared guides only to targeted groups", () => {
    const shared = guide({
      audience: "groups",
      audienceGroupIds: [SHARED_TARGET],
    });
    expect(
      resolveGuidePermissions(
        access({ memberGroupIds: new Set([SHARED_TARGET]) }),
        shared,
      ).canRead,
    ).toBe(true);
    expect(
      resolveGuidePermissions(
        access({ ownerGroupIds: new Set([SHARED_TARGET]) }),
        shared,
      ).canRead,
    ).toBe(true);
    expect(
      resolveGuidePermissions(
        access({ memberGroupIds: new Set([DEPT_B]) }),
        shared,
      ).canRead,
    ).toBe(false);
  });

  it("treats a groups-audience guide with no targets as space-only", () => {
    const perms = resolveGuidePermissions(
      access({ memberGroupIds: new Set([DEPT_B]) }),
      guide({ audience: "groups" }),
    );
    expect(perms.canRead).toBe(false);
  });

  it("never grants reads on archived guides to outsiders", () => {
    const perms = resolveGuidePermissions(
      access(),
      guide({ status: "archived", audience: "all_staff" }),
    );
    expect(perms.canRead).toBe(false);
  });

  describe("guides awaiting deletion approval", () => {
    const deleted = guide({ status: "deleted", audience: "all_staff" });
    const nothing = { canRead: false, canEdit: false, canApprove: false };

    it("are hidden from members", () => {
      expect(
        resolveGuidePermissions(
          access({ memberGroupIds: new Set([DEPT_A]) }),
          deleted,
        ),
      ).toEqual(nothing);
    });

    it("are hidden from the author", () => {
      expect(
        resolveGuidePermissions(
          access({ userId: "user-a", memberGroupIds: new Set([DEPT_A]) }),
          guide({ status: "deleted", createdBy: "user-a" }),
        ),
      ).toEqual(nothing);
    });

    it("are hidden from space owners", () => {
      expect(
        resolveGuidePermissions(
          access({ ownerGroupIds: new Set([DEPT_A]) }),
          deleted,
        ),
      ).toEqual(nothing);
    });

    it("are readable by admins, who may neither edit nor approve", () => {
      expect(
        resolveGuidePermissions(access({ isAdmin: true }), deleted),
      ).toEqual({ canRead: true, canEdit: false, canApprove: false });
    });
  });
});

describe("canDeleteGuideOutright", () => {
  const creator = access({ userId: "user-a", memberGroupIds: new Set([DEPT_A]) });
  const neverPublished = {
    ...guide({ status: "draft", createdBy: "user-a" }),
    publishedAt: null,
  };

  it("lets the creator delete their never-published draft", () => {
    expect(canDeleteGuideOutright(creator, neverPublished)).toBe(true);
  });

  it("refuses once the guide has ever been published", () => {
    expect(
      canDeleteGuideOutright(creator, {
        ...neverPublished,
        publishedAt: new Date("2026-01-01"),
      }),
    ).toBe(false);
    // Converted back to draft after publishing: staff may have read it.
    expect(
      canDeleteGuideOutright(creator, {
        ...neverPublished,
        status: "draft",
        publishedAt: new Date("2026-01-01"),
      }),
    ).toBe(false);
  });

  it("refuses a creator who is no longer a member of the space", () => {
    expect(
      canDeleteGuideOutright(access({ userId: "user-a" }), neverPublished),
    ).toBe(false);
  });

  it("refuses an owner on a colleague's draft", () => {
    expect(
      canDeleteGuideOutright(
        access({ userId: "user-b", ownerGroupIds: new Set([DEPT_A]) }),
        neverPublished,
      ),
    ).toBe(false);
  });

  it("lets an admin delete a never-published draft they created", () => {
    expect(
      canDeleteGuideOutright(
        access({ userId: "user-a", isAdmin: true }),
        neverPublished,
      ),
    ).toBe(true);
  });

  it("refuses a guide already awaiting deletion", () => {
    expect(
      canDeleteGuideOutright(creator, { ...neverPublished, status: "deleted" }),
    ).toBe(false);
  });

  it("refuses when the creator is unknown", () => {
    expect(
      canDeleteGuideOutright(creator, {
        ...neverPublished,
        createdBy: undefined,
      }),
    ).toBe(false);
  });
});
