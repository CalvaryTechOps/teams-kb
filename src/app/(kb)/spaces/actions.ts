"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, inArray, isNull, max, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  allStaffRequest,
  category,
  guide,
  guideAudienceGroup,
  guideDeletionRequest,
  guideRevision,
  guideTag,
  m365Group,
  space,
  tag,
} from "@/db/schema";
import {
  CONTENT_VERSION,
  GuideContentError,
  blocksToPlainText,
  isEmptyDocument,
  parseGuideContent,
  type GuideBlock,
} from "@/lib/guide-content";
import {
  requireAccess,
  requireAdmin,
  resolveGuidePermissions,
  type UserAccess,
} from "@/lib/permissions";
import { GENERAL_CATEGORY_SLUG } from "@/lib/categories";
import {
  guidePath,
  moveCategoryInTx,
  moveGeneralGuidesInTx,
  moveGuideInTx,
  revalidateMove,
  uniqueGuideSlugIn,
} from "@/lib/moves";
import { slugify } from "@/lib/slug";
import { pruneUnusedTags } from "@/lib/tags";

// All guide mutations live here; every one starts with a permission check
// against the space's group (never the UI's word for it).

async function spaceBySlugOr404(slug: string) {
  const [s] = await db.select().from(space).where(eq(space.slug, slug));
  if (!s) notFound();
  return s;
}

function spacePermissions(access: UserAccess, spaceGroupId: string) {
  // "Can this user author/approve in this space at all" — a published
  // department guide stands in, since unpublished guides are further gated
  // by authorship (checked against the real guide where one exists).
  return resolveGuidePermissions(access, {
    spaceGroupId,
    status: "published",
    audience: "department",
  });
}

async function uniqueGuideSlug(spaceId: string, title: string) {
  return uniqueGuideSlugIn(db, spaceId, slugify(title));
}

/**
 * Comma-separated tag names → replace the guide's tag set. Tags this guide
 * was the last user of are pruned afterwards so the picker never offers a
 * tag nothing uses.
 */
async function syncTags(guideId: string, tagsInput: string) {
  const names = [
    ...new Set(
      tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 12),
    ),
  ];

  await db.delete(guideTag).where(eq(guideTag.guideId, guideId));
  for (const name of names) {
    const slug = slugify(name);
    const [existing] = await db.select().from(tag).where(eq(tag.slug, slug));
    const tagId =
      existing?.id ??
      (await db.insert(tag).values({ name, slug }).returning())[0]!.id;
    await db.insert(guideTag).values({ guideId, tagId });
  }
  await pruneUnusedTags();
}

/**
 * Apply an approver's audience choice (M6). Group-sharing takes effect
 * immediately; "all staff" is applied directly by admins but only *requested*
 * by owners — the guide keeps its current audience until an admin approves.
 */
async function applyAudience(
  access: UserAccess,
  guideId: string,
  spaceGroupId: string,
  formData: FormData,
) {
  const requested = String(formData.get("audience") ?? "");
  if (!["department", "groups", "all_staff"].includes(requested)) return;

  // Validate targets against live synced groups; the space's own group is
  // never a target (its members already read department guides).
  let targetIds: string[] = [];
  if (requested === "groups") {
    const submitted = formData
      .getAll("audienceGroupIds")
      .map(String)
      .filter((id) => id && id !== spaceGroupId);
    if (submitted.length > 0) {
      targetIds = (
        await db
          .select({ id: m365Group.id })
          .from(m365Group)
          .where(and(inArray(m365Group.id, submitted), isNull(m365Group.deletedAt)))
      ).map((r) => r.id);
    }
  }
  // "Specific teams" with nothing picked means department-only in practice.
  const audience =
    requested === "groups" && targetIds.length === 0
      ? "department"
      : (requested as "department" | "groups" | "all_staff");

  if (audience === "all_staff" && !access.isAdmin) {
    // Owner request: guide audience unchanged until an admin decides.
    const pending = await db
      .select({ id: allStaffRequest.id })
      .from(allStaffRequest)
      .where(
        and(
          eq(allStaffRequest.guideId, guideId),
          eq(allStaffRequest.status, "pending"),
        ),
      );
    const [g] = await db
      .select({ audience: guide.audience })
      .from(guide)
      .where(eq(guide.id, guideId));
    if (pending.length === 0 && g?.audience !== "all_staff") {
      await db
        .insert(allStaffRequest)
        .values({ guideId, requestedBy: access.userId });
    }
    return;
  }

  await db.transaction(async (tx) => {
    await tx.update(guide).set({ audience }).where(eq(guide.id, guideId));
    await tx
      .delete(guideAudienceGroup)
      .where(eq(guideAudienceGroup.guideId, guideId));
    if (audience === "groups") {
      await tx
        .insert(guideAudienceGroup)
        .values(targetIds.map((groupId) => ({ guideId, groupId })));
    }
    // Choosing a narrower audience withdraws an open all-staff request
    // (recorded as rejected so the trail survives); an admin picking
    // all-staff directly settles it as approved.
    await tx
      .update(allStaffRequest)
      .set({
        status: audience === "all_staff" ? "approved" : "rejected",
        decidedBy: access.userId,
        decidedAt: new Date(),
        note:
          audience === "all_staff"
            ? null
            : "Withdrawn — the audience was changed on the guide.",
      })
      .where(
        and(
          eq(allStaffRequest.guideId, guideId),
          eq(allStaffRequest.status, "pending"),
        ),
      );
  });
}

export async function createCategory(spaceSlug: string, formData: FormData) {
  const access = await requireAccess();
  const s = await spaceBySlugOr404(spaceSlug);
  if (!spacePermissions(access, s.groupId).canApprove) redirect(`/spaces/${s.slug}`);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect(`/spaces/${s.slug}`);

  const slug = slugify(name);
  // "General" is the synthetic card for uncategorized guides; a real
  // category with that slug would be unreachable and ambiguous to move.
  if (slug === GENERAL_CATEGORY_SLUG) redirect(`/spaces/${s.slug}`);
  const existing = await db
    .select({ id: category.id })
    .from(category)
    .where(and(eq(category.spaceId, s.id), eq(category.slug, slug)));
  if (existing.length === 0) {
    await db.insert(category).values({ spaceId: s.id, name, slug });
  }
  revalidatePath(`/spaces/${s.slug}`);
}

type SaveGuideInput = {
  spaceSlug: string;
  /** Absent when creating a new guide. */
  guideId?: string;
  intent: "draft" | "publish";
};

export async function saveGuide(input: SaveGuideInput, formData: FormData) {
  const access = await requireAccess();
  const s = await spaceBySlugOr404(input.spaceSlug);
  const perms = spacePermissions(access, s.groupId);
  if (!perms.canEdit) redirect(`/spaces/${s.slug}`);
  const publish = input.intent === "publish" && perms.canApprove;
  // A member's "publish" is a submission: the revision waits in the owner
  // queue as pending, and the live guide is untouched until it's approved.
  const newRevisionStatus = publish
    ? ("published" as const)
    : input.intent === "publish"
      ? ("pending" as const)
      : ("draft" as const);

  const title = String(formData.get("title") ?? "").trim();
  // The editor submits its BlockNote document as JSON. Validate the structure
  // and whitelist URLs before anything is stored; a malformed or tampered
  // payload bounces exactly like blank content.
  let content: GuideBlock[];
  try {
    content = parseGuideContent(String(formData.get("content") ?? ""));
  } catch (err) {
    if (err instanceof GuideContentError) redirect(`/spaces/${s.slug}`);
    throw err;
  }
  const categoryId = String(formData.get("categoryId") ?? "") || null;
  const tagsInput = String(formData.get("tags") ?? "");
  if (!title || isEmptyDocument(content)) redirect(`/spaces/${s.slug}`);

  let guideSlug: string;

  if (!input.guideId) {
    // New guide + revision 1 in one transaction.
    guideSlug = await uniqueGuideSlug(s.id, title);
    const guideId = await db.transaction(async (tx) => {
      const [g] = await tx
        .insert(guide)
        .values({
          spaceId: s.id,
          categoryId,
          slug: guideSlug,
          title,
          createdBy: access.userId,
        })
        .returning({ id: guide.id });
      const [rev] = await tx
        .insert(guideRevision)
        .values({
          guideId: g!.id,
          version: 1,
          title,
          content,
          contentVersion: CONTENT_VERSION,
          status: newRevisionStatus,
          authorId: access.userId,
        })
        .returning({ id: guideRevision.id });
      if (publish) {
        await tx
          .update(guide)
          .set({
            status: "published",
            currentRevisionId: rev!.id,
            searchText: blocksToPlainText(content),
            publishedAt: new Date(),
          })
          .where(eq(guide.id, g!.id));
      }
      return g!.id;
    });
    await syncTags(guideId, tagsInput);
    if (perms.canApprove) {
      await applyAudience(access, guideId, s.groupId, formData);
    }
  } else {
    const [g] = await db
      .select()
      .from(guide)
      .where(and(eq(guide.id, input.guideId), eq(guide.spaceId, s.id)));
    if (!g) notFound();
    // Re-check against the real guide: a member may not touch a colleague's
    // unpublished guide they can't even see.
    const guidePerms = resolveGuidePermissions(access, {
      spaceGroupId: s.groupId,
      status: g.status,
      audience: g.audience,
      createdBy: g.createdBy,
    });
    if (!guidePerms.canEdit) redirect(`/spaces/${s.slug}`);
    guideSlug = g.slug;

    await db.transaction(async (tx) => {
      // One pending submission per guide: a resubmission supersedes the
      // previous one so the queue never shows stale versions. (An owner's
      // direct publish leaves pendings alone — they still deserve review.)
      if (newRevisionStatus === "pending") {
        await tx
          .update(guideRevision)
          .set({ status: "superseded" })
          .where(
            and(
              eq(guideRevision.guideId, g.id),
              eq(guideRevision.status, "pending"),
            ),
          );
      }
      const [{ top }] = await tx
        .select({ top: max(guideRevision.version) })
        .from(guideRevision)
        .where(eq(guideRevision.guideId, g.id));
      const [rev] = await tx
        .insert(guideRevision)
        .values({
          guideId: g.id,
          version: (top ?? 0) + 1,
          title,
          content,
          contentVersion: CONTENT_VERSION,
          status: newRevisionStatus,
          authorId: access.userId,
        })
        .returning({ id: guideRevision.id });

      if (publish) {
        if (g.currentRevisionId) {
          await tx
            .update(guideRevision)
            .set({ status: "superseded" })
            .where(eq(guideRevision.id, g.currentRevisionId));
        }
        await tx
          .update(guide)
          .set({
            title,
            categoryId,
            status: "published",
            currentRevisionId: rev!.id,
            searchText: blocksToPlainText(content),
            publishedAt: g.publishedAt ?? new Date(),
          })
          .where(eq(guide.id, g.id));
      } else {
        // Draft save: never touches the published surface. Only a
        // never-published guide takes the new title/category immediately.
        if (g.status === "draft") {
          await tx
            .update(guide)
            .set({ title, categoryId })
            .where(eq(guide.id, g.id));
        }
      }
    });
    await syncTags(g.id, tagsInput);
    if (perms.canApprove) {
      await applyAudience(access, g.id, s.groupId, formData);
    }
  }

  revalidatePath("/");
  revalidatePath(`/spaces/${s.slug}`);
  revalidatePath(`/spaces/${s.slug}/guides/${guideSlug}`);
  revalidatePath(`/spaces/${s.slug}/queue`);
  redirect(`/spaces/${s.slug}/guides/${guideSlug}`);
}

// ---------------------------------------------------------------------------
// Approval queue (M5). Approve/reject operate on a specific pending revision
// id — never "the latest" — so a decision can't land on a resubmission the
// owner hasn't seen.
// ---------------------------------------------------------------------------

async function pendingRevisionForReview(revisionId: string) {
  const access = await requireAccess();
  const [row] = await db
    .select({
      rev: guideRevision,
      g: guide,
      spaceSlug: space.slug,
      groupId: space.groupId,
    })
    .from(guideRevision)
    .innerJoin(guide, eq(guide.id, guideRevision.guideId))
    .innerJoin(space, eq(space.id, guide.spaceId))
    .where(eq(guideRevision.id, revisionId));
  if (!row) notFound();
  if (!spacePermissions(access, row.groupId).canApprove) {
    redirect(`/spaces/${row.spaceSlug}`);
  }
  // Already decided (or superseded by a resubmission), or the guide itself is
  // awaiting deletion: bounce back to the queue, which re-renders the truth.
  if (row.rev.status !== "pending" || row.g.status === "deleted") {
    redirect(`/spaces/${row.spaceSlug}/queue`);
  }
  return { access, ...row };
}

export async function approveRevision(revisionId: string) {
  const { access, rev, g, spaceSlug } = await pendingRevisionForReview(revisionId);

  await db.transaction(async (tx) => {
    if (g.currentRevisionId) {
      await tx
        .update(guideRevision)
        .set({ status: "superseded" })
        .where(eq(guideRevision.id, g.currentRevisionId));
    }
    await tx
      .update(guideRevision)
      .set({
        status: "published",
        reviewedBy: access.userId,
        reviewedAt: new Date(),
      })
      .where(eq(guideRevision.id, rev.id));
    await tx
      .update(guide)
      .set({
        title: rev.title,
        status: "published",
        currentRevisionId: rev.id,
        searchText: blocksToPlainText(rev.content),
        publishedAt: g.publishedAt ?? new Date(),
      })
      .where(eq(guide.id, g.id));
  });

  revalidatePath(`/spaces/${spaceSlug}`);
  revalidatePath(`/spaces/${spaceSlug}/guides/${g.slug}`);
  revalidatePath(`/spaces/${spaceSlug}/queue`);
  redirect(`/spaces/${spaceSlug}/queue`);
}

export async function rejectRevision(revisionId: string, formData: FormData) {
  const { access, rev, g, spaceSlug } = await pendingRevisionForReview(revisionId);
  const note = String(formData.get("note") ?? "").trim() || null;

  await db
    .update(guideRevision)
    .set({
      status: "rejected",
      reviewedBy: access.userId,
      reviewedAt: new Date(),
      reviewNote: note,
    })
    .where(eq(guideRevision.id, rev.id));

  revalidatePath(`/spaces/${spaceSlug}`);
  revalidatePath(`/spaces/${spaceSlug}/guides/${g.slug}`);
  revalidatePath(`/spaces/${spaceSlug}/queue`);
  redirect(`/spaces/${spaceSlug}/queue`);
}

/** Owner/admin publishes the newest draft revision of a guide. */
export async function publishLatestDraft(guideId: string) {
  const access = await requireAccess();
  const [row] = await db
    .select({ g: guide, spaceSlug: space.slug, groupId: space.groupId })
    .from(guide)
    .innerJoin(space, eq(space.id, guide.spaceId))
    .where(eq(guide.id, guideId));
  if (!row) notFound();
  if (!spacePermissions(access, row.groupId).canApprove) {
    redirect(`/spaces/${row.spaceSlug}/guides/${row.g.slug}`);
  }
  if (row.g.status === "deleted") redirect(`/spaces/${row.spaceSlug}`);

  const [draft] = await db
    .select()
    .from(guideRevision)
    .where(
      and(eq(guideRevision.guideId, guideId), eq(guideRevision.status, "draft")),
    )
    .orderBy(desc(guideRevision.version))
    .limit(1);
  if (!draft) redirect(`/spaces/${row.spaceSlug}/guides/${row.g.slug}`);

  await db.transaction(async (tx) => {
    if (row.g.currentRevisionId) {
      await tx
        .update(guideRevision)
        .set({ status: "superseded" })
        .where(eq(guideRevision.id, row.g.currentRevisionId));
    }
    await tx
      .update(guideRevision)
      .set({
        status: "published",
        reviewedBy: access.userId,
        reviewedAt: new Date(),
      })
      .where(eq(guideRevision.id, draft.id));
    await tx
      .update(guide)
      .set({
        title: draft.title,
        status: "published",
        currentRevisionId: draft.id,
        searchText: blocksToPlainText(draft.content),
        publishedAt: row.g.publishedAt ?? new Date(),
      })
      .where(eq(guide.id, guideId));
  });

  revalidatePath(`/spaces/${row.spaceSlug}`);
  revalidatePath(`/spaces/${row.spaceSlug}/guides/${row.g.slug}`);
  redirect(`/spaces/${row.spaceSlug}/guides/${row.g.slug}`);
}

// ---------------------------------------------------------------------------
// Unpublish / delete. Both owner-or-admin only. Deletion is a *request*: the
// guide vanishes immediately but its rows survive until an admin approves
// (see /admin/deletion-requests); a rejection restores it as a draft.
// ---------------------------------------------------------------------------

type GuideRef = { spaceSlug: string; guideId: string };

async function ownedGuideOrBounce(input: GuideRef) {
  const access = await requireAccess();
  const s = await spaceBySlugOr404(input.spaceSlug);
  if (!spacePermissions(access, s.groupId).canApprove) redirect(`/spaces/${s.slug}`);
  const [g] = await db
    .select()
    .from(guide)
    .where(and(eq(guide.id, input.guideId), eq(guide.spaceId, s.id)));
  if (!g) notFound();
  return { access, s, g };
}

function revalidateGuide(spaceSlug: string, guideSlug: string) {
  revalidatePath("/");
  revalidatePath(`/spaces/${spaceSlug}`);
  revalidatePath(`/spaces/${spaceSlug}/guides/${guideSlug}`);
  revalidatePath(`/spaces/${spaceSlug}/queue`);
}

/** Owner/admin takes a published guide back to draft for rework. */
export async function convertGuideToDraft(input: GuideRef) {
  const { s, g } = await ownedGuideOrBounce(input);
  const editHref = `/spaces/${s.slug}/guides/${g.slug}/edit`;
  if (g.status !== "published") redirect(editHref);

  // The published revision keeps its status and stays currentRevisionId, so
  // the guide page still renders it (with a Draft badge) until the next
  // publish supersedes it. Only the body leaves the search index.
  await db
    .update(guide)
    .set({ status: "draft", searchText: null })
    .where(and(eq(guide.id, g.id), eq(guide.status, "published")));

  revalidateGuide(s.slug, g.slug);
  redirect(editHref);
}

/** Owner/admin hides a guide and queues it for an admin to hard-delete. */
export async function requestGuideDeletion(input: GuideRef) {
  const { access, s, g } = await ownedGuideOrBounce(input);
  if (g.status === "deleted") redirect(`/spaces/${s.slug}`);

  await db.transaction(async (tx) => {
    await tx
      .update(guide)
      .set({ status: "deleted", searchText: null })
      .where(and(eq(guide.id, g.id), ne(guide.status, "deleted")));
    // A deleted guide can't go to all staff; withdraw any open request so the
    // admin queue never shows an unreachable guide.
    await tx
      .update(allStaffRequest)
      .set({
        status: "rejected",
        decidedBy: access.userId,
        decidedAt: new Date(),
        note: "Withdrawn — the guide was deleted.",
      })
      .where(
        and(
          eq(allStaffRequest.guideId, g.id),
          eq(allStaffRequest.status, "pending"),
        ),
      );
    const open = await tx
      .select({ id: guideDeletionRequest.id })
      .from(guideDeletionRequest)
      .where(
        and(
          eq(guideDeletionRequest.guideId, g.id),
          eq(guideDeletionRequest.status, "pending"),
        ),
      );
    if (open.length === 0) {
      await tx.insert(guideDeletionRequest).values({
        guideId: g.id,
        guideTitle: g.title,
        spaceId: s.id,
        spaceName: s.name,
        requestedBy: access.userId,
      });
    }
  });

  revalidateGuide(s.slug, g.slug);
  revalidatePath("/admin");
  revalidatePath("/admin/deletion-requests");
  revalidatePath("/admin/guides");
  redirect(`/spaces/${s.slug}`);
}

// ---------------------------------------------------------------------------
// Moving content. Space owners (and admins) may re-file a guide into another
// category of its own space — the same thing the guide form's category picker
// does, in one step. Handing content to a *different* department is an admin
// decision (plan Q9/Q10, revised after testing). Category moves are
// admin-only. Primitives live in src/lib/moves.ts.
// ---------------------------------------------------------------------------

async function targetSpaceOrNull(spaceId: string) {
  if (!spaceId) return null;
  const [t] = await db.select().from(space).where(eq(space.id, spaceId));
  return t ?? null;
}

/** A category id from the form, verified to belong to the target space. */
async function categoryInSpaceOrNull(categoryId: string, spaceId: string) {
  if (!categoryId) return null;
  const [c] = await db
    .select({ id: category.id })
    .from(category)
    .where(and(eq(category.id, categoryId), eq(category.spaceId, spaceId)));
  return c ?? null;
}

export async function moveGuide(input: GuideRef, formData: FormData) {
  const access = await requireAccess();
  const s = await spaceBySlugOr404(input.spaceSlug);
  if (!spacePermissions(access, s.groupId).canApprove) redirect(`/spaces/${s.slug}`);
  const [g] = await db
    .select()
    .from(guide)
    .where(and(eq(guide.id, input.guideId), eq(guide.spaceId, s.id)));
  if (!g) notFound();
  const back = guidePath(s.slug, g.slug);

  const target = await targetSpaceOrNull(String(formData.get("spaceId") ?? ""));
  if (!target) redirect(back);
  // Only admins may move a guide out of its department.
  if (target.id !== s.id && !access.isAdmin) redirect(back);
  const requestedCategory = String(formData.get("categoryId") ?? "");
  const cat = await categoryInSpaceOrNull(requestedCategory, target.id);
  // An id that isn't one of the target's categories is a stale or tampered
  // form — don't silently file the guide under General.
  if (requestedCategory && !cat) redirect(back);
  const categoryId = cat?.id ?? null;
  if (target.id === s.id && categoryId === g.categoryId) redirect(back);

  const moved = await db.transaction((tx) =>
    moveGuideInTx(tx, g, { spaceId: target.id, categoryId }),
  );

  const dest = guidePath(target.slug, moved.newSlug);
  revalidateMove({ spaceSlugs: [s.slug, target.slug], guidePaths: [back, dest] });
  redirect(dest);
}

type CategoryRef = { spaceSlug: string; categorySlug: string };

export async function moveCategory(input: CategoryRef, formData: FormData) {
  await requireAdmin();
  const s = await spaceBySlugOr404(input.spaceSlug);
  const [cat] = await db
    .select()
    .from(category)
    .where(and(eq(category.spaceId, s.id), eq(category.slug, input.categorySlug)));
  if (!cat) notFound();
  const back = `/spaces/${s.slug}#${cat.slug}`;

  const target = await targetSpaceOrNull(String(formData.get("spaceId") ?? ""));
  if (!target || target.id === s.id) redirect(back);

  const result = await db.transaction((tx) => moveCategoryInTx(tx, cat, target.id));

  revalidateMove({
    spaceSlugs: [s.slug, target.slug],
    guidePaths: result.guides.flatMap((m) => [
      guidePath(s.slug, m.oldSlug),
      guidePath(target.slug, m.newSlug),
    ]),
  });
  redirect(`/spaces/${target.slug}#${cat.slug}`);
}

/** "Move all General guides": every uncategorized guide of a space (plan Q6). */
export async function moveGeneralGuides(spaceSlug: string, formData: FormData) {
  await requireAdmin();
  const s = await spaceBySlugOr404(spaceSlug);
  const back = `/spaces/${s.slug}#${GENERAL_CATEGORY_SLUG}`;

  const target = await targetSpaceOrNull(String(formData.get("spaceId") ?? ""));
  if (!target || target.id === s.id) redirect(back);
  const requestedCategory = String(formData.get("categoryId") ?? "");
  const cat = await categoryInSpaceOrNull(requestedCategory, target.id);
  if (requestedCategory && !cat) redirect(back);

  const moved = await db.transaction((tx) =>
    moveGeneralGuidesInTx(tx, s.id, {
      spaceId: target.id,
      categoryId: cat?.id ?? null,
    }),
  );

  revalidateMove({
    spaceSlugs: [s.slug, target.slug],
    guidePaths: moved.flatMap((m) => [
      guidePath(s.slug, m.oldSlug),
      guidePath(target.slug, m.newSlug),
    ]),
  });
  redirect(`/spaces/${target.slug}`);
}
