@AGENTS.md

## Public repository

This repo is public. Nothing sensitive goes into committed files, including
`plans/`: no credentials, tokens, connection strings, internal hostnames,
real member or staff data, or private conversation details. Naming Chris
(the repo owner) is fine. Any sample data in plans, tests, docs, or fixtures
must be generic and sanitized (placeholder names, emails like
`user@example.com`, made-up IDs).

## Implementation plans

Deferred/pending implementation plans live in `plans/` — one markdown file per
plan, each with context, design, steps, and open questions. When asked to
execute a plan (e.g. "execute the handle-orphaned-spaces plan"), read its file
first, get answers to its open questions, then implement and keep the file's
status line updated. Executing a plan ends with local verification (tests,
lint, typecheck, build) and a commit on the feature branch. It never
includes pushing — not the feature branch, not staging, not a PR. Chris
tests locally and iterates first, then asks for a push explicitly. Plans
must not list a push or deploy as a step.

`plans/completed/` is history, not a queue: plans move there once their PR
merges, kept for design rationale and answered questions. Never execute or
resume a plan from that folder, and prefer the code over it where they differ.

## Branch & deploy workflow

- **Local dev** runs on `localhost:3000` against the Neon `development` DB
  branch (`.env.local`); reset it from production in the Neon console whenever
  fresh data is wanted. Schema changes: edit `src/db/schema.ts`, then
  `npx drizzle-kit generate` + `npx drizzle-kit migrate`.
- **Feature work** happens on `feat/*` branches off `main`. Never commit
  directly to `main` or `staging`.
- **Staging**: to test on the staging deployment before a PR, use the
  `push-to-staging` skill — it force-replaces the `staging` branch with
  the current feature branch (staging is a scratch branch, always
  `main + one feature`). Only run it when Chris explicitly asks to push
  to staging in the current message; never as a follow-on to finishing
  a change or executing a plan.
- **Ship** by pushing the feature branch and opening a PR to `main`. Merging
  is the only manual step: every Vercel build (previews, staging, production)
  runs `drizzle-kit migrate` itself, and each preview gets its own Neon DB
  branch via the Neon integration.
