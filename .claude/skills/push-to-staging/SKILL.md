---
name: push-to-staging
description: Replace the staging branch with the current feature branch and deploy it to the staging deployment for testing. Use when the user says "push this to staging", "deploy this to staging", or similar.
---

# Push the current feature branch to staging

`staging` is a scratch deployment branch, not an integration branch: it is
force-replaced by whichever feature branch is being tested, so it always holds
exactly `main + one feature`. Vercel deploys it to
the staging hostname (branch-scoped env vars: staging Entra SAML app, staging
`NEXT_PUBLIC_APP_URL`). Its database is the Neon branch the
Neon–Vercel integration created for `staging` — persistent, NOT reset by
pushes.

## Steps

1. **Preconditions.** The current branch must be a feature branch — if it is
   `main` or `staging`, stop and ask which branch to push. If the working tree
   has uncommitted changes, ask whether to commit them first; never push
   half-committed work silently.

2. **Record the old staging head** (needed for the migration check):
   `git fetch origin && git rev-parse origin/staging`

3. **Push the feature branch itself** (backup + later PR):
   `git push -u origin <branch>`

4. **Force-replace staging with it:**
   `git push --force-with-lease origin HEAD:staging`
   then keep the local pointer in sync: `git branch -f staging origin/staging`.
   Force is expected here — staging's history is disposable.

5. **Migration hygiene check.** Compare migrations between the old staging
   head and the new one: `git diff <old-staging-sha> HEAD --stat -- drizzle/`.
   - If the old staging head had migration files that the new branch does NOT
     have, the staging Neon DB has orphaned migrations applied and journaled —
     tell the maintainer to reset the Neon staging DB branch from production (Neon
     console → the `staging`/preview branch → Reset from parent) before
     trusting the deployment.
   - New migrations the feature adds need no action: the Vercel build runs
     `drizzle-kit migrate` automatically.

6. **Report.** Vercel auto-deploys the push; testing happens at the staging
   hostname (the `staging` branch's `NEXT_PUBLIC_APP_URL`). Reminders that sometimes matter:
   - Staging sits behind Vercel Authentication. If SSO or access fails for a
     tester, they need the bypass-cookie link once per browser:
     `https://<staging-host>/?x-vercel-protection-bypass=<secret>&x-vercel-set-bypass-cookie=samesitenone`
     (secret: Vercel → Settings → Deployment Protection → Protection Bypass
     for Automation).
   - When testing is done, the feature ships by PR to `main` (push the feature
     branch and open GitHub's pull/new link), never by merging `staging`.
