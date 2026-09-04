import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// M365 directory mirror (synced from Microsoft Graph — never edited by hand,
// except the is_department / is_admin_group flags which admins set in-app).
// ---------------------------------------------------------------------------

export const groupMemberRole = pgEnum("group_member_role", ["member", "owner"]);

export const m365Group = pgTable("m365_group", {
  // The Entra group object id — natural key, matches Graph.
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  mail: text("mail"),
  // Admin flags: department groups get a KB space to author guides in.
  isDepartment: boolean("is_department").default(false).notNull(),
  // Members of admin-flagged groups are KB admins.
  isAdminGroup: boolean("is_admin_group").default(false).notNull(),
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
  // Set when a full sync no longer sees the group in Entra.
  deletedAt: timestamp("deleted_at"),
});

export const m365GroupMember = pgTable(
  "m365_group_member",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => m365Group.id, { onDelete: "cascade" }),
    // Keyed on the Entra oid, NOT user.id: memberships exist before a person's
    // first sign-in. Join user.entra_object_id at query time.
    entraObjectId: text("entra_object_id").notNull(),
    role: groupMemberRole("role").notNull(),
    syncedAt: timestamp("synced_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.entraObjectId, t.role] }),
    index("group_member_oid_idx").on(t.entraObjectId),
  ],
);

// ---------------------------------------------------------------------------
// Spaces — one per department-flagged group, auto-created when flagged.
// ---------------------------------------------------------------------------

export const space = pgTable("space", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: text("group_id")
    .notNull()
    .unique()
    .references(() => m365Group.id),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Operational tables
// ---------------------------------------------------------------------------

// Admin-editable site copy (see src/lib/site-settings.ts). One row per key,
// value is a JSON string; a missing row means "use the code default".
export const appSetting = pgTable("app_setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  // user.id of the admin who last saved it (no FK: keep the audit value even
  // if the account is removed).
  updatedBy: text("updated_by"),
});

export const syncRun = pgTable("sync_run", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(), // 'full' | 'user'
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  groupsCount: integer("groups_count"),
  membershipsCount: integer("memberships_count"),
  error: text("error"),
});
