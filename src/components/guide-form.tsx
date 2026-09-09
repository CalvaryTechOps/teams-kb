import { Button, ButtonLink } from "@/components/ui";
import { GuideEditor } from "@/components/editor/guide-editor";
import {
  AudiencePicker,
  type AudienceValue,
} from "@/components/audience-picker";
import { TagPicker } from "@/components/tag-picker";
import type { PickableTag } from "@/lib/tag-picker";
import type { GuideBlock } from "@/lib/guide-content";
import { saveGuide } from "@/app/(kb)/spaces/actions";
export function GuideForm({
  spaceSlug,
  guideId,
  categories,
  allTags,
  canApprove,
  cancelHref,
  defaults,
  audience,
}: {
  spaceSlug: string;
  guideId?: string;
  categories: { id: string; name: string }[];
  /** Every tag in the system, for the find-as-you-type picker. */
  allTags: PickableTag[];
  canApprove: boolean;
  cancelHref: string;
  defaults?: {
    title?: string;
    categoryId?: string | null;
    /** Validated BlockNote document of the revision being edited. */
    content?: GuideBlock[];
    tagNames?: string[];
  };
  /** Owner-only audience controls; omit for members (server ignores them anyway). */
  audience?: {
    spaceName: string;
    groups: { id: string; name: string }[];
    defaultAudience: AudienceValue;
    defaultGroupIds: string[];
    isAdmin: boolean;
    hasPendingAllStaffRequest?: boolean;
  };
}) {
  const inputClasses =
    "rounded-lg border border-border-strong bg-surface-raised px-3 text-sm text-fg-strong " +
    "focus:border-accent focus:shadow-focus focus:outline-none";

  return (
    // Two regions in one <form>: the editor column (title, content, buttons)
    // and a side panel with category, tags and — for approvers — the audience
    // picker. The panel is last in DOM order so it stacks *below* the button
    // row on narrow screens and sits to the right at xl+ — one markup order,
    // and tab order matches the screen in both modes. Side-by-side waits for
    // xl: the app sidebar (268px) plus page padding leaves too little editor
    // width at lg.
    <form className="flex flex-col gap-5 xl:flex-row xl:items-start xl:gap-6">
      <div className="flex min-w-0 max-w-[860px] flex-1 flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="title" className="text-sm font-medium text-fg-strong">
            Title
          </label>
          <input
            id="title"
            name="title"
            required
            defaultValue={defaults?.title}
            placeholder="How to…"
            className={`h-11 text-base font-medium ${inputClasses}`}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-fg-strong">Content</span>
          <GuideEditor name="content" initialContent={defaults?.content} />
          <p className="text-xs text-fg-muted">
            Type <kbd className="rounded border border-border bg-surface px-1">/</kbd>{" "}
            for headings, lists, tables, diagrams and more. Paste or drop
            images, audio or video to upload them.
          </p>
        </div>

        <div className="flex items-center gap-3 border-t border-border pt-5">
          {/* Same "publish" intent for both roles — the server decides: owners
            publish immediately, members' submissions land in the queue. */}
          <Button
            type="submit"
            formAction={saveGuide.bind(null, {
              spaceSlug,
              guideId,
              intent: "publish",
            })}
          >
            {canApprove ? "Publish" : "Submit for approval"}
          </Button>
          <Button
            type="submit"
            variant="secondary"
            formAction={saveGuide.bind(null, {
              spaceSlug,
              guideId,
              intent: "draft",
            })}
          >
            Save draft
          </Button>
          <ButtonLink href={cancelHref} variant="ghost">
            Cancel
          </ButtonLink>
          {!canApprove && (
            <p className="text-xs text-fg-muted">
              Submissions go live once a group owner approves them.
            </p>
          )}
        </div>
      </div>

      <aside className="flex flex-col gap-5 xl:w-72 xl:shrink-0">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="categoryId" className="text-sm font-medium text-fg-strong">
            Category
          </label>
          <select
            id="categoryId"
            name="categoryId"
            defaultValue={defaults?.categoryId ?? ""}
            className={`h-11 ${inputClasses}`}
          >
            <option value="">General</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="tags" className="text-sm font-medium text-fg-strong">
            Tags
          </label>
          <TagPicker
            allTags={allTags}
            defaultSelected={defaults?.tagNames}
          />
        </div>
        {audience && <AudiencePicker {...audience} />}
      </aside>
    </form>
  );
}
