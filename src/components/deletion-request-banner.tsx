import { Button } from "@/components/ui";
import { ConfirmForm } from "@/components/confirm-form";
import { timeAgo } from "@/lib/time";
import {
  approveGuideDeletion,
  rejectGuideDeletion,
} from "@/app/admin/deletion-requests/actions";

// Red banner at the top of a guide an admin is previewing while its deletion
// request is open (plans/preview-pending-deletion.md). Carries the same two
// decisions as the admin queue, bound to the request: approving lands back
// on the queue, rejecting restores the guide and stays on it.

export function DeletionRequestBanner({
  request,
  guideTitle,
  revisionCount,
}: {
  request: {
    id: string;
    requesterName: string | null;
    createdAt: Date;
    reason: string | null;
  } | null;
  guideTitle: string;
  revisionCount: number;
}) {
  return (
    <div className="mb-5 rounded-lg border border-danger-100 bg-danger-soft/50 px-4 py-3 text-sm text-fg print:hidden">
      {request ? (
        <>
          <p>
            <span className="font-medium">This guide is pending deletion.</span>{" "}
            Requested by {request.requesterName ?? "an owner"}{" "}
            {timeAgo(request.createdAt)}. It is hidden from everyone until
            you decide.
          </p>
          {request.reason && (
            <p className="mt-1.5 text-[13px] text-fg-muted">
              Reason: “{request.reason}”
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <ConfirmForm
              action={approveGuideDeletion.bind(null, request.id)}
              message={`Delete "${guideTitle}" and all ${revisionCount} revisions permanently? This cannot be undone.`}
            >
              <Button type="submit" variant="danger" size="sm">
                Approve — delete permanently
              </Button>
            </ConfirmForm>
            <form
              action={rejectGuideDeletion.bind(null, request.id)}
              className="flex flex-1 items-center gap-2"
            >
              <input
                name="note"
                placeholder="Reason (kept with the request)"
                className="w-full min-w-48 flex-1 rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm"
              />
              <Button type="submit" variant="secondary" size="sm">
                Reject — restore guide
              </Button>
            </form>
          </div>
        </>
      ) : (
        <p>
          This guide is marked for deletion but no open request exists for
          it. Nothing can be decided from here.
        </p>
      )}
    </div>
  );
}
