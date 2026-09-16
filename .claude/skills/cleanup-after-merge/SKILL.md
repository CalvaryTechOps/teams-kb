---
name: cleanup-after-merge
description: After Chris has merged a feature's PR into main — verify on origin that the branch really is merged, switch to main, pull, and delete the merged feature branch locally (and on origin if GitHub left it). Use when the user says "clean up after the merge", "PR merged, clean up", "I merged it", "tidy the branch", or similar. Optional argument: a branch name; defaults to the current branch.
---

# Clean up after a merged PR

Chris has merged the feature's PR into `main` on GitHub (merging is always
their step). This skill brings the local checkout back to a clean starting
point: `main` checked out and current, the merged feature branch gone.
Nothing is committed and nothing is pushed except the optional deletion of
the merged branch on origin.

The branch to clean up is the argument if one was given, otherwise the
current branch.

## Steps

1. **Preconditions.** The target branch must be a feature branch — `feat/*`,
   `chore/*`, `fix/*` or similar — never `main` or `staging` (stop and ask
   if it is). The branch must exist locally. If the working tree has
   uncommitted changes to tracked files, stop and ask what to do with them
   before switching branches; untracked files (a pending plan in `plans/`,
   for instance) are fine and come along untouched.

2. **Refresh the remote and prune:** `git fetch origin --prune`. Pruning
   drops the stale `origin/<branch>` tracking ref when GitHub already
   deleted the branch on merge, which it does for this repo.

3. **Verify the merge — both checks.**
   - Ask GitHub: `gh pr view <branch> --json number,state,mergedAt,mergeCommit,baseRefName`.
     `state` must be `MERGED` and `baseRefName` must be `main`.
   - Ask git: `git merge-base --is-ancestor <branch> origin/main` must
     succeed (PRs here are merged with a merge commit, so the branch tip is
     an ancestor of `main`). If the merge commit from `gh` is in
     `origin/main` (`git merge-base --is-ancestor <mergeCommit> origin/main`)
     but the ancestor check fails, the PR was squashed or rebased; that is
     still a merge, proceed but say so.

   If either source says the branch is **not** merged (no PR, `OPEN`,
   `CLOSED` without merge, or the tip is not in `origin/main`), stop
   without switching or deleting anything and report exactly what was
   found — an unmerged branch is never deleted by this skill.

4. **Switch and update main:**

   ```
   git switch main
   git pull --ff-only origin main
   ```

   A non-fast-forward pull means local `main` has commits that origin does
   not; stop and report — local `main` must never diverge (CLAUDE.md:
   nothing is committed to `main` directly).

5. **Delete the local branch:** `git branch -d <branch>`. Use `-D` only if
   `-d` refuses because of a squash/rebase merge that step 3 already
   confirmed.

6. **Delete the remote branch if it is still there.** Check with
   `git ls-remote --heads origin <branch>`; if it lists the branch, run
   `git push origin --delete <branch>`. If it is already gone (the normal
   case), say so. Never touch `staging` — it is a scratch branch that
   keeps whatever feature it last received until the next push-to-staging.

7. **Report**: the PR number and merge commit, that `main` is at
   `origin/main`'s tip (short SHA), which branches were deleted where, and
   the branches that were left alone. Also list any other local branches
   that are already merged into `origin/main`
   (`git branch --merged origin/main`, excluding `main` and `staging`) as
   a hint — do not delete them unless Chris asks; they may be a different
   feature's leftovers.

## Not in scope

- Editing the completed plan's status to name the PR number. That would be
  a commit on `main`, which this repo never does directly; it rides along
  with the next feature if Chris wants it.
- Resetting `staging` or its Neon database. push-to-staging handles the
  branch on the next feature and reports when the database needs a reset.
