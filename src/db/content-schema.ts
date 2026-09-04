import { sql, type SQL } from "drizzle-orm";
import {
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { GuideBlock } from "../lib/guide-content";
import { user } from "./auth-schema";
import { m365Group, space } from "./directory-schema";

// ---------------------------------------------------------------------------
// Knowledgebase content. A BlockNote JSON document (array of blocks) is the
// single canonical format — see src/lib/guide-content.ts for the accepted
// shape. Every edit is a guide_revision, so the schema is version-history-ready
// even though v1 ships no history UI.
// ---------------------------------------------------------------------------

// Postgres full-text search vector; drizzle has no built-in for it.
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const guideStatus = pgEnum("guide_status", [
  "draft",
  "published",
  "archived",
  // Hidden everywhere (admins included) while a deletion request awaits an
  // admin decision; approval hard-deletes, rejection restores to draft.
  "deleted",
]);

// Who may see a *published* guide (drafts are always space-only).
export const guideAudience = pgEnum("guide_audience", [
  "department",
  "groups",
  "all_staff",
]);

export const revisionStatus = pgEnum("revision_status", [
  "draft",
  "pending",
  "published",
  "rejected",
  "superseded",
]);

// One level of categories per space, ordered by hand.
export const category = pgTable(
  "category",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => space.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("category_space_slug_idx").on(t.spaceId, t.slug)],
);

export const guide = pgTable(
  "guide",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => space.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => category.id, {
      onDelete: "set null",
    }),
    slug: text("slug").notNull(),
    // Denormalized from the current revision so lists never join revisions.
    title: text("title").notNull(),
    status: guideStatus("status").default("draft").notNull(),
    audience: guideAudience("audience").default("department").notNull(),
    currentRevisionId: uuid("current_revision_id").references(
      (): AnyPgColumn => guideRevision.id,
    ),
    // Plain text of the published revision's body, written at publish time
    // only so draft content never leaks into search.
    searchText: text("search_text"),
    // FTS document (M7): title weighted A, published body B. Generated, so
    // it can never drift from the row.
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('english', coalesce(${guide.title}, '')), 'A') || setweight(to_tsvector('english', coalesce(${guide.searchText}, '')), 'B')`,
    ),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    publishedAt: timestamp("published_at"),
  },
  (t) => [
    uniqueIndex("guide_space_slug_idx").on(t.spaceId, t.slug),
    index("guide_space_status_idx").on(t.spaceId, t.status),
    index("guide_search_vector_idx").using("gin", t.searchVector),
  ],
);

export const guideRevision = pgTable(
  "guide_revision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guideId: uuid("guide_id")
      .notNull()
      .references(() => guide.id, { onDelete: "cascade" }),
    // Monotonic per guide; assigned max(version)+1 inside the write transaction.
    version: integer("version").notNull(),
    title: text("title").notNull(),
    // BlockNote document (array of blocks). Validated on write by
    // parseGuideContent(); never trusted raw on read.
    content: jsonb("content").$type<GuideBlock[]>().notNull(),
    // Bumped when the block schema changes in a way a renderer must know about.
    contentVersion: integer("content_version").default(1).notNull(),
    status: revisionStatus("status").default("draft").notNull(),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id),
    reviewedBy: text("reviewed_by").references(() => user.id),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    reviewedAt: timestamp("reviewed_at"),
  },
  (t) => [
    uniqueIndex("revision_guide_version_idx").on(t.guideId, t.version),
    // The approval queue reads pending rows; keep that scan cheap.
    index("revision_pending_idx")
      .on(t.guideId)
      .where(sql`${t.status} = 'pending'`),
  ],
);

// Target groups when audience = 'groups'.
export const guideAudienceGroup = pgTable(
  "guide_audience_group",
  {
    guideId: uuid("guide_id")
      .notNull()
      .references(() => guide.id, { onDelete: "cascade" }),
    groupId: text("group_id")
      .notNull()
      .references(() => m365Group.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.guideId, t.groupId] })],
);

export const tag = pgTable("tag", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
});

export const guideTag = pgTable(
  "guide_tag",
  {
    guideId: uuid("guide_id")
      .notNull()
      .references(() => guide.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.guideId, t.tagId] })],
);

export const allStaffRequestStatus = pgEnum("all_staff_request_status", [
  "pending",
  "approved",
  "rejected",
]);

// Publishing to all staff needs an admin sign-off (M6 builds the UI).
export const allStaffRequest = pgTable(
  "all_staff_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guideId: uuid("guide_id")
      .notNull()
      .references(() => guide.id, { onDelete: "cascade" }),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => user.id),
    status: allStaffRequestStatus("status").default("pending").notNull(),
    decidedBy: text("decided_by").references(() => user.id),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    decidedAt: timestamp("decided_at"),
  },
  (t) => [
    // At most one open request per guide.
    uniqueIndex("all_staff_request_pending_idx")
      .on(t.guideId)
      .where(sql`${t.status} = 'pending'`),
  ],
);

// Owners can only *request* deletion; the guide is hidden immediately and the
// rows are removed once an admin approves. The request outlives the guide
// (FKs set null, title/space snapshotted) so the audit trail survives.
export const guideDeletionRequest = pgTable(
  "guide_deletion_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guideId: uuid("guide_id").references(() => guide.id, {
      onDelete: "set null",
    }),
    guideTitle: text("guide_title").notNull(),
    spaceId: uuid("space_id").references(() => space.id, {
      onDelete: "set null",
    }),
    spaceName: text("space_name").notNull(),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => user.id),
    status: allStaffRequestStatus("status").default("pending").notNull(),
    decidedBy: text("decided_by").references(() => user.id),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    decidedAt: timestamp("decided_at"),
  },
  (t) => [
    // At most one open request per guide.
    uniqueIndex("deletion_request_pending_idx")
      .on(t.guideId)
      .where(sql`${t.status} = 'pending'`),
  ],
);
