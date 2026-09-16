---
name: ship-feature
description: Wrap up a feature after it passed staging — move its plan to plans/completed, mark it complete, commit that housekeeping on the feature branch, push the branch to origin and open the PR to main with gh. Use when the user says "ship it", "clean house and push the feature", "staging passed, wrap it up", "ready to merge", or similar.
---

# Ship a feature that passed staging

Chris has tested the current feature branch locally and on staging and is
ready for the PR to `main`. This skill does the housekeeping that should
ride along in that PR — the plan moves to `plans/completed/`, its status
says it passed staging — then pushes the feature branch (not `staging`) and
opens the PR with `gh`.

It does NOT merge or touch `staging`. Merging is always Chris's step.

## Steps

1. **Preconditions.** The current branch must be a `feat/*` branch — on
   `main` or `staging`, stop and ask which branch to ship. If the working
   tree has uncommitted changes, ask whether they belong in this feature
   before continuing; never fold unknown edits into the housekeeping commit.

2. **Find the plan.** The plan is normally `plans/<name>.md` where `<name>`
   is the branch without `feat/` (`feat/guide-permalinks` →
   `plans/guide-permalinks.md`). If that file doesn't exist, look for a plan
   in `plans/` whose status line names the branch; if there is still no
   match, or more than one, ask. If the plan is already in
   `plans/completed/`, skip the move and only refresh the status line.
   A branch with no plan at all (a small fix) skips to step 5.

3. **Move it:** `git mv plans/<name>.md plans/completed/<name>.md`.

4. **Update the status line** — the bold `**Status: …**` sentence at the top.
   Rewrite it to this shape, keeping today's date (`date +%F`) and the
   branch name:

   ```
   **Status: complete — implemented on `feat/<name>` (<YYYY-MM-DD>),
   tested by Chris locally and on staging; awaiting the PR to `main`.**
   ```

   Keep everything after that sentence (verification notes, "notes from
   implementation", answered questions) — only the sentence changes. If the
   old status mentions things that were verified before the push (lint,
   typecheck, tests, build), keep that text too. Do not rewrite design
   sections; `plans/completed/` is history and the code is the source of
   truth where they differ. Code comments that cite `plans/<name>.md` are
   left alone — earlier plans set that precedent.

5. **Commit** on the feature branch:

   ```
   Mark the <name> plan complete

   Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
   ```

   (Use the attribution line the session's system reminder gives, if it
   differs.) If there was no plan and nothing else to commit, say so and go
   on to the push.

6. **Push the feature branch:** `git push -u origin <branch>`. Only the
   feature branch — `staging` already has the feature, and `main` is
   touched by merging the PR, never directly.

7. **Write the PR description** from the plan and the diff. One short
   paragraph in plain prose (no headers, no bullets): what a user can now
   do, the one or two design decisions a reviewer should know about (a new
   table or migration, a new route, a permission rule, a setting), and how
   it was verified — lint, typecheck, tests, build, and staging. Then a
   line linking the plan, `plans/completed/<name>.md`, and the PR
   attribution line from the session's system reminder (currently
   `🤖 Generated with [Claude Code](https://claude.com/claude-code)`).
   The title is the feature commit's subject line unless a better one is
   obvious.

8. **Open the PR** to `main` with `gh` (authenticated with a PAT that can
   open PRs; `gh auth status` if in doubt). Pass the body through a file so
   the Markdown survives quoting:

   ```
   gh pr create --base main --head <branch> --title "<title>" --body-file <tmpfile>
   ```

   If a PR for the branch already exists (`gh pr view <branch>` succeeds),
   update its title and body with `gh pr edit` instead of creating a second
   one. If `gh` fails (expired token, network), fall back to reporting the
   compare link `https://github.com/CalvaryTechOps/teams-kb/pull/new/<branch>`
   with the title and body in a fenced code block so Chris can open it by
   hand — never leave the feature pushed with no PR and no instructions.

9. **Report** the branch, the housekeeping commit, and the PR URL. Merging
   is Chris's step: every Vercel build runs the migrations itself. Say if
   the PR carries a migration, so the merge can be timed.

## After the merge

Nothing more for this skill: the plan already lives in `plans/completed/`.
Once Chris has merged the PR and says so, the `cleanup-after-merge` skill
verifies the merge on origin, switches to `main`, pulls and deletes the
feature branch. If Chris later asks to note the PR number or "live in
production", edit the status sentence in place (earlier plans read "merged
to `main` via PR #N and live in production") — on a feature branch, never
directly on `main`.
