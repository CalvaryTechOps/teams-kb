import { describe, expect, it } from "vitest";
import { buildUserAccess, type MembershipRow } from "./user-access";

const row = (
  groupId: string,
  role: MembershipRow["role"] = "member",
  isAdminGroup = false,
): MembershipRow => ({ groupId, role, isAdminGroup });

describe("buildUserAccess", () => {
  it("has no groups and is not admin without an Entra object id", () => {
    const access = buildUserAccess({
      userId: "u1",
      entraObjectId: null,
      rows: [row("g1", "owner", true)],
      bootstrapAdminGroupId: "g1",
    });
    expect(access.memberGroupIds.size).toBe(0);
    expect(access.ownerGroupIds.size).toBe(0);
    expect(access.isAdmin).toBe(false);
  });

  it("treats owners as members too", () => {
    const access = buildUserAccess({
      userId: "u1",
      entraObjectId: "oid",
      rows: [row("dept", "owner"), row("other")],
    });
    expect([...access.memberGroupIds].sort()).toEqual(["dept", "other"]);
    expect([...access.ownerGroupIds]).toEqual(["dept"]);
    expect(access.isAdmin).toBe(false);
  });

  it("grants admin via an admin-flagged group", () => {
    const access = buildUserAccess({
      userId: "u1",
      entraObjectId: "oid",
      rows: [row("admins", "member", true)],
    });
    expect(access.isAdmin).toBe(true);
  });

  it("grants admin via the bootstrap group even when unflagged", () => {
    const access = buildUserAccess({
      userId: "u1",
      entraObjectId: "oid",
      rows: [row("it-team")],
      bootstrapAdminGroupId: "it-team",
    });
    expect(access.isAdmin).toBe(true);
  });

  it("ignores an empty bootstrap id", () => {
    const access = buildUserAccess({
      userId: "u1",
      entraObjectId: "oid",
      rows: [row("g")],
      bootstrapAdminGroupId: "",
    });
    expect(access.isAdmin).toBe(false);
  });
});
