import { describe, expect, it } from "vitest";
import {
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

    it("are hidden even from admins", () => {
      expect(
        resolveGuidePermissions(access({ isAdmin: true }), deleted),
      ).toEqual(nothing);
    });
  });
});
