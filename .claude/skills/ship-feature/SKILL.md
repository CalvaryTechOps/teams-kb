---
name: ship-feature
description: Wrap up a feature after it passed staging — move its plan to plans/completed, mark it complete, commit that housekeeping on the feature branch and push the branch to origin so the PR can be opened. Use when the user says "ship it", "clean house and push the feature", "staging passed, wrap it up", "ready to merge", or similar.
---

# Ship a feature that passed staging

Chris has tested the current feature branch locally and on staging and is
ready to open the PR to `main`. This skill does the housekeeping that should
ride along in that PR: the plan moves to `plans/completed/`, its status says
it passed staging, and the feature branch (not `staging`) is pushed.

It does NOT merge, touch `staging`, or open the PR unless asked (see step 7).

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

7. **Report** the branch, the commit, and the compare link
   `https://github.com/CalvaryTechOps/teams-kb/pull/new/<branch>`.

8. **Draft the PR description** in the same reply, in a fenced code block
   so Chris can copy it straight into GitHub. One short paragraph in plain
   prose (no headers, no bullets) written from the plan and the diff: what a
   user can now do, the one or two design decisions a reviewer should know
   about (a new table or migration, a new route, a permission rule, a
   setting), and how it was verified — lint, typecheck, tests, build, and
   staging. Then a line linking the plan, `plans/completed/<name>.md`, and
   the PR attribution line from the session's system reminder (currently
   `🤖 Generated with [Claude Code](https://claude.com/claude-code)`).
   Suggest a PR title as well: the feature commit's subject line usually
   works. Open the PR with `gh pr create` only if Chris asked for that in
   the same message ("…and open the PR") — then use the same title and
   body. Merging is always Chris's step: every Vercel build runs the
   migrations itself.

## After the merge

Nothing to do here: the plan already lives in `plans/completed/`. If Chris
later asks to note the PR number or "live in production", edit the status
sentence in place (earlier plans read "merged to `main` via PR #N and live
in production").
