# Process

> Primary documentation language: Chinese · [中文](./PROCESS.md)

This document defines the complete path from an idea to a release. Models must follow it in order; a red state at any step blocks the next one.

## Roles

- Human: decides what to build, reviews and approves pull requests, adds the `human-approved` and `ci-change` labels, decides the version and creates tags.
- Model: reads the docs, opens a branch, writes implementation and tests, runs the gate, opens the PR, fixes red lines, and maintains the bilingual docs and CHANGELOG.

## The full path of one change

1. Read [AGENTS.en.md](./AGENTS.en.md) and [docs/gates.en.md](./docs/gates.en.md); identify the change type and its blast radius.
2. Branch from the latest main, with a type prefix in the branch name.
3. Change code, tests, bilingual docs or CHANGELOG in the same commits.
4. Run the gate locally and push only when everything is green; a plugin repository uses the command published by the center and never copies scripts.
5. Open the PR, tick every template item, and explain the motivation and how it was verified.
6. A human merges once `ci / ci-ok` and `pr-guard / guard` are green and the labels are present; delete the branch afterwards.

The gate reads labels from the GitHub API at run time (`DSH_CI_PR_LABELS` exists only for tests), so a rerun sees a label added after the original event; the PR body is fetched live too, so fixing the checklist and rerunning is enough. When that lookup fails in CI the gate fails instead of falling back to the stale event snapshot. The `--pr` checks run in their own `.github/workflows/pr-guard.yml` (check name `pr-guard / guard`), decoupled from the six-cell verify matrix: changing labels or the PR description reruns only that light job and the matrix no longer runs for nothing. After `ci-change` or `human-approved` is added, or the PR description is edited, the caller's `.github/workflows/ci-rerun.yml` reruns the existing `pr-guard` run on the same commit instead of opening a new one: a rerun is a new attempt of the same run, its check runs are replaced in place, and the SHA keeps exactly one status. The ruleset therefore never sees two check suites and cannot report BLOCKED. Callers' `ci.yml` and `pr-guard.yml` no longer listen to `labeled` / `unlabeled`, and no empty commit is needed to retrigger CI; events other than `opened` / `synchronize` never start verify again. `ci-rerun.yml` runs on `pull_request_target`: a fork PR's `pull_request` token is read-only and cannot request `actions: write`, while this workflow never checks out PR code and only calls the API from the trusted context. The split is an opt-in migration: `ci.yml` passes `with: separate-guard: true` and `pr-guard.yml` runs the guard alone; an un-migrated caller omits the switch, keeps the guard inside `reusable-ci.yml` with unchanged behaviour, and the gate only prints a migration hint. When migrating, change `pr-guard.yml`, `separate-guard: true`, and the `ci-rerun.yml` target together.

```bash
git switch main
git pull --ff-only
git switch -c feat/my-change
```

## Branches and commits

- Allowed prefixes: `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`, `release/`.
- Write commit messages in the imperative mood, one sentence per change; one PR does one thing.
- Version bumps, tags and npm publishing happen only through the release flow; models never release on their own.

## When CI fails

- Read the `fix:` hint on each failing line and fix the root cause; never edit the gate to get around it.
- Never add `.only`, `.skip`, `@ts-ignore` or `eslint-disable`.
- Changes to a caller workflow, `ci.config.json`, the schema or center policy need the maintainer `ci-change` label; models must not add it themselves.
- If it keeps failing, document every attempt in the PR and hand it to a human instead of retrying silently.

## Version and release

1. Bump the version on a `release/x.y.z` branch and add the same version section to both CHANGELOG files.
2. After it lands on main, a human creates the tag; the tag must equal the version.
3. The caller `release.yml` invokes the center reusable release workflow, which publishes to npm, creates the GitHub Release and verifies the result.
4. If the npm version exists but the GitHub Release is missing or incomplete, run `release.yml` manually from Actions with the tag; recovery rebuilds only the GitHub Release and never runs `npm publish` again.

```bash
git tag v1.0.0
git push origin v1.0.0
```

## How reusable workflows take effect

A plugin `.github/workflows/*.yml` is only a caller that points at the center with `@v1`; when the center fixes a bug or adds a check, every repository picks it up on its next CI run with no sync script.

That pin is a contract: models must not switch it to `@main`, copy the gate back into the repository, or delete a caller. `wiring.workflows` rejects all of these.

## Forbidden

- Running `npm publish` on a local machine.
- Copying or hand-editing `ci-gate.mjs`, or vendoring center scripts into a plugin repository.
- Deleting or rewriting the required items of the PR template.
- Force-pushing main, merging around `ci / ci-ok` or `pr-guard / guard`, or merging your own PR while CI is red.
