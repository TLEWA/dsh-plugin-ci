# Model playbook

> Primary documentation language: Chinese · [中文](./model-playbook.md)

The rules in this repository are machine-enforced: the constraints written in `AGENTS.md` are checked one by one by `scripts/ci-gate.mjs`, and the PR `guard` turns corner-cutting red. This document explains how a model should think and act when a check is red.

## Role boundaries

A model may:

- Change code, tests, bilingual docs and the CHANGELOG on `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/` branches.
- Run this repository's gate and test commands, and fix red checks until they are green.
- Open a PR, tick every template item, and explain what changed and how it was verified.

A model must not:

- Run `npm publish`, or change the version on a branch other than `release/`.
- Add the `ci-change` / `human-approved` labels itself.
- Use `--skip=`, delete a check, `.only`, `@ts-ignore` or `eslint-disable` to turn a red check green.
- Copy `ci-gate.mjs` into a plugin repository, or change a caller's `@v1` to `@main`; `wiring.workflows` blocks both.
- Change `ci.config.json`, a caller workflow, the schema or a ruleset to loosen the rules for itself (these are sensitive files; the PR needs the `ci-change` label and maintainer confirmation).
- Hand-edit `lib/` output as if it were source; output may only be produced by the build command.

## Standard loop

1. Read `AGENTS.en.md`, `PROCESS.en.md` and `docs/gates.en.md` first; confirm this repository's build, test and documentation requirements.
2. Branch from the latest `main`; the branch name must match `^(feat|fix|chore|docs|refactor|test|release)/[a-z0-9._-]+$`.
3. Put code and tests in the same commit; if there is build output, rebuild and commit it together.
4. Update both Chinese and English docs in the same PR; when behavior changes, add an `[Unreleased]` entry to the CHANGELOG.
5. Run locally:

```bash
npx --yes --package=github:TLEWA/dsh-plugin-ci#v1 dsh-ci-gate
npm test
```

6. Open the PR; fix `guard` failures using the `fix:` hint, and do not retry the same violation.
7. Merge only after a maintainer adds `human-approved`; after merging, a maintainer creates the release tag.
8. On failure, read the `fix:` line in the output; if it is unclear, consult the rationale table in `docs/gates.en.md`.

## Red-check quick reference

| Check | Meaning | Correct action |
| --- | --- | --- |
| `config.schema` | `ci.config.json` has missing keys, extra keys or wrong types | Fill it in according to `schema/ci.config.schema.json`; do not delete keys |
| `wiring.workflows` | The caller is missing, the pin is not `@v1`, the repository has a gate copy, or `.ci/` is not ignored | Restore the thin caller; delete the copy; add `.ci/` to `.gitignore` |
| `wiring.repository` | Publishing is enabled but `repository` does not match the GitHub repository | Use the canonical form `https://github.com/<owner>/<repo>.git` |
| `wiring.prepublish` | Publishing is enabled but `prepublishOnly` does not call the center gate | Add `npx --yes --package=github:TLEWA/dsh-plugin-ci#v1 dsh-ci-gate --prepublish`; do not remove it |
| `manifest.engines` | Top-level `engines.dsh` is missing, or `manifestVersion` is not 1 | Add it at the top level of `package.json`, not under `dsh.engines` |
| `manifest.bundle` | `dsh.bundle.patch` is missing, or `insert[].name` does not equal the package name | Point it at a real `cordis.patch.yml` and use the full package name in `name` |
| `manifest.exports` | `exports`/`main` points at a missing file, or inject uses a bare module | Point at real files; inject only `@deepseek-ai/*` |
| `files.present` | A `files` entry does not exist, or a required doc is missing | Add the file; do not remove `files` entries to pass |
| `tarball.contents` | Packed contents are missing, contain forbidden files or exceed the size limit | Adjust `files` and `tarball.mustInclude/mustExclude`; do not change the check |
| `artifacts.fresh` | Build output does not match the source | Run the build command and commit the `lib/` changes |
| `typecheck` / `tests` | A type or test fails | Fix the root cause; do not delete tests or add skip markers |
| `docs.pairs` | Chinese/English doc structure or code-block commands differ | Change both sides together; keep commands identical |
| `docs.links` | A relative link points at a missing file | Add the file or fix the link; do not bypass it with an absolute URL |
| `version.changelog` | The first CHANGELOG section is not the current version, or the bilingual version section is missing | Write the version in both `CHANGELOG.md` and `CHANGELOG.en.md` |
| `repo.hygiene` | `node_modules`, `*.tgz`, `.env`, logs and similar files are committed | Delete them and add them to `.gitignore` |
| `guard.g1` | A required PR template item is not ticked | Confirm each item and change it to `- [x]` |
| `guard.g2` | The branch name is not compliant | Rename the branch; do not change the check |
| `guard.g3` | `.only` / `.skip` / `xit` was added | Remove it; CI must run every test |
| `guard.g4` | A type or lint suppression was added | Fix the root cause; if suppression is truly needed, explain it in the PR and wait for `ci-change` |
| `guard.g5` | CI-sensitive files changed without the `ci-change` label | Ask the maintainer to review and add the label |
| `guard.g6` | A forbidden file was added | Delete it and add it to `.gitignore` |
| `guard.g7` | The version changed outside a `release/` branch, or the CHANGELOG was not updated | Move the version change to a `release/<version>` branch |
| `guard.g9` | The `human-approved` label is missing | Wait for a maintainer; a model must not add it |

## When to stop and ask a human

- A CI-sensitive file, the version or the release process must change.
- A new dependency is needed, the build must change, or tests cannot run in the current environment.
- The same red check still fails after two attempts following its hint.
- The request is ambiguous, or the fix would change user-visible behavior.

## Anti-patterns

- Treating "it works locally" as evidence: the PR is judged by CI's `ci / ci-ok`.
- Putting `--skip=` in a workflow, or copying the gate into a repository so checks are "visible" but no longer controlled by the center.
- Editing docs to describe a failure as a pass; `docs.links` and `docs.pairs` will expose it.
- Mixing unrelated refactors into one PR; `guard.g8` warns about diff size.
