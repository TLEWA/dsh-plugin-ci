# Why every check exists

> Primary documentation language: Chinese · [中文](./gates.md)

Every check in `ci-gate.mjs` maps to a real failure a user has hit. Read this before deleting a check.

## verify (runs locally and in CI)

| Check | What it blocks | Why |
| --- | --- | --- |
| `config.schema` | Unknown keys, wrong types, missing fields | A misconfigured schema that silently does nothing is more dangerous than an error |
| `wiring.workflows` | A missing caller, a pin that is not `@vN`, a gate copied back into this repository, `.ci/` missing from `.gitignore`, a missing `ci-rerun.yml`, or a `ci.yml` that still listens to `labeled` / `unlabeled` | The reusable workflow is the only execution path; a copy forks the rules, and a label event that opens a new run leaves two check suites on one SHA, which the ruleset reads as BLOCKED |
| `wiring.repository` | Publishing is enabled but `package.json` `repository` does not match the GitHub repository | npm provenance and source tracing depend on this field |
| `wiring.prepublish` | Publishing is enabled but `prepublishOnly` does not call `dsh-ci-gate --prepublish` | Without this hook, a local `npm publish` is not blocked and releases can happen outside a tag |
| `manifest.name` | Package name/version format or repository name does not match | npm and GitHub cannot be reconciled when they disagree |
| `manifest.bundle` | The patch file is missing, or its name does not match the package name | The host resolves plugins by package name; a wrong name means the plugin never loads |
| `manifest.engines` | Top-level `engines.dsh` is missing, or manifestVersion does not match | The host and plugin marketplace read only the top-level field |
| `manifest.exports` | An export points at a missing file, or inject contains a bare module | The install succeeds but the plugin 404s or fails to resolve at runtime |
| `files.present` | A files entry is missing, or a required document is absent | A package missing files ships a half-finished product |
| `tarball.contents` | A forbidden file is packed, the package is too large, or the version is wrong | Passing locally does not prove the published contents are correct |
| `artifacts.fresh` | Build output is stale | A committed dist that disagrees with the source misleads users |
| `typecheck` | Type errors | Types are a contract; do not leave them to runtime luck |
| `tests` | A test fails or is not collected | A test that never runs does not exist |
| `docs.pairs` | Chinese/English heading counts, commands or versions differ | Updating only one side makes the other side lie |
| `docs.links` | A relative link is broken | Dead links are how documentation rots |
| `version.changelog` | The version section is missing or empty | Users need to know about breaking changes before upgrading |
| `version.runtime` | A hand-written `VERSION` in shipped code disagrees with `package.json` | Status routes and UIs report an old version, so bug reports cite the wrong release |
| `repo.hygiene` | `node_modules`, `.env`, tgz or log files are committed | Leaks secrets and bloats the repository |

## release (runs only on a tag)

| Check | What it blocks |
| --- | --- |
| `release.r1-tag-version` | The tag and the `package.json` version differ |
| `release.r2-ancestor` | The tag is not on main (a release that bypassed review) |
| `release.r3-clean-tree` | The worktree is dirty or build output is stale (`.ci` does not count as dirty) |
| `release.r4-notes` | The CHANGELOG is missing the current version |
| `release.r5-unpublished` | npm already has the same version (an overwrite release) |
| `release.r6-verify` | verify is not fully green before publishing |
| `release.r7-post` | The published gitHead / integrity / provenance does not match |

## guard (PR only)

| Check | What it blocks |
| --- | --- |
| `guard.g1-checklist` | A required PR checklist item is not ticked |
| `guard.g2-branch` | The branch name is not compliant |
| `guard.g3-focus-tests` | Newly added `.only` / `.skip` / `xit` |
| `guard.g4-suppressions` | Newly added `@ts-ignore` or lint suppressions |
| `guard.g5-sensitive` | CI-sensitive files changed without the `ci-change` label |
| `guard.g6-forbidden-files` | Newly added tgz / node_modules / .env / log files |
| `guard.g7-version-bump` | A version bump outside a release branch, or without a CHANGELOG entry |
| `guard.g8-diff-size` | A very large diff (a warning that asks for a split) |
| `guard.g9-human-approved` | The human approval label is missing |

## How to read a failure

- `✓` passed, `·` skipped (the config is null or the mode does not apply), `!` warning (does not block), `✗` failed.
- The line after a failure is `fix:`, the shortest path to a fix, not a suggestion.
- In this repository run `node scripts/ci-gate.mjs --only=manifest.engines`; in a plugin repository use `npx --yes --package=github:TLEWA/dsh-plugin-ci#v1 dsh-ci-gate --only=manifest.engines`, and in CI use `node .ci/scripts/ci-gate.mjs`.
