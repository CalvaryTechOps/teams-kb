# Plan: ESLint 10

**Status: blocked (planned 2026-09-12, deferred from the
dependency-audit-2026-09 plan). Waits on plugin peer ranges — see
"Entry condition".**

## Context

`eslint` is at 9.39.5; 10.10.0 is out. Our config is already flat
(`eslint.config.mjs`) and Node 24 satisfies ESLint 10's requirement, so the
core migration is small. The blocker is downstream: `eslint-config-next`
16.3.5 declares `eslint >=9.0.0`, but three of its own dependencies still
cap at ESLint 9 in their peer ranges (checked 2026-09-12):

| Plugin | Installed | Declared `eslint` peer |
| --- | --- | --- |
| `eslint-plugin-react` | 7.37.5 (latest) | `… || ^9.7` |
| `eslint-plugin-jsx-a11y` | 6.10.2 (latest) | `… || ^9` |
| `eslint-plugin-import` | 2.32.0 (latest) | `… || ^9` |
| `typescript-eslint` | 8.68 | `^8.57 || ^9 || ^10` ✓ |
| `eslint-plugin-react-hooks` | 7.1.1 | `… || ^9 || ^10` ✓ |

npm 11 resolves peers strictly, so `npm install eslint@10` fails with
`ERESOLVE` until those three publish ESLint 10 support (or
`eslint-config-next` replaces them). `--legacy-peer-deps` or an override
would work but hides real incompatibilities in the lint run; not worth it
for a dev-only tool.

What ESLint 10 changes for us once unblocked: nothing in config format;
three new rules in `eslint:recommended` (`no-unassigned-vars`,
`no-useless-assignment`, `preserve-caught-error`) — but our config extends
only `eslint-config-next`'s presets, not `js/recommended`, so they apply
only if those presets pick them up; `eslint-env` comments become errors
(none in the repo); config-file lookup now starts from each linted file's
directory (single config at the root, no effect).

## Entry condition

All three plugins list `^10` in `peerDependencies.eslint`:

```sh
for p in eslint-plugin-react eslint-plugin-jsx-a11y eslint-plugin-import; do
  echo "$p: $(npm view $p peerDependencies.eslint)"; done
```

Also check whether a newer `eslint-config-next` has changed its plugin set.

## Steps

1. Branch `feat/eslint-10`. Re-run the entry-condition check; record the
   versions in this file.
2. `npm install -D eslint@^10` (and the newer plugin versions if
   `eslint-config-next` does not pull them itself). `npm ls` must be clean
   with no `--legacy-peer-deps`.
3. `npm run lint`. Fix findings from newly enabled rules in code; do not
   disable rules to get green unless a rule is clearly wrong for this
   codebase, in which case say so in the commit message.
4. Verification: lint, typecheck, tests, `next build`.
5. Commit. No push.

## Open questions

None; the only decision is timing, which the entry condition settles.
