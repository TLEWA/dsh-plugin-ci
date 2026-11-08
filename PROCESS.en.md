# Process

This document defines the complete path from an idea to a release. Models must follow it in order; a red state at any step blocks the next one.

## Roles

- Human: decides what to build, reviews and approves pull requests, adds the `human-approved` and `ci-change` labels, and decides the version.
- Model: reads the docs, opens a branch, writes implementation and tests, runs verify, opens the PR, fixes red lines, and maintains the bilingual docs and CHANGELOG.

## The full path of one change

1. Read [AGENTS.md](./AGENTS.md) and [docs/gates.md](./docs/gates.md); identify the change type and its blast radius.
2. Branch from the latest main, with a type prefix in the branch name.
3. Change code, tests, bilingual README or CHANGELOG in the same commits.
4. Run verify locally and push only when everything is green.
5. Open the PR, tick every template item, and explain the motivation and how it was verified.
6. A human merges once CI is green and the labels are present; delete the branch afterwards.

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
- Changes to workflows, `ci.config.json` or `scripts/ci-gate.mjs` need the maintainer's `ci-change` label; models must not add it themselves.
- If it keeps failing, document every attempt in the PR and hand it to a human instead of retrying silently.

## Version and release

1. Bump the version on a `release/x.y.z` branch and add the same version section to both CHANGELOG files.
2. After it lands on main, a human creates the tag; the tag must equal the version.
3. The release workflow publishes to npm, creates the GitHub Release and verifies the result.

```bash
git tag v1.0.0
git push origin v1.0.0
```

## Forbidden

- Running `npm publish` on a local machine.
- Hand-editing `scripts/ci-gate.mjs` (it must be synced from the canonical repository).
- Deleting or rewriting the required items of the PR template.
- Force-pushing main or merging your own PR while CI is red.
